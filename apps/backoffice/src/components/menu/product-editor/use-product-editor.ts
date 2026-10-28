"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApiFailure } from "../../../lib/api/api-result";
import { failureMessage, isSignedOut } from "../../../lib/errors/failure-message";
import { vi } from "../../../messages/vi";
import { useApi } from "../../app/api-context";
import { useSession } from "../../shell/session-context";
import { type Loaded, loadFailure } from "../../shell/use-api-load";
import { checkProductDraft } from "./check-product-draft";
import type { DraftErrors } from "./draft-error-paths";
import type { SizesOf } from "./draft-to-product-body";
import { serverRefusalErrors } from "./server-refusal-errors";
import { type ProductDraft, draftOfDocument, emptyDraft } from "./product-draft";
import type { DraftEdit } from "./product-draft-edits";

const T = vi.menu.editor;
const VERSION_CONFLICT = "API_CATALOG_VERSION_CONFLICT";

export interface EditorNotice {
  readonly kind: "error" | "ok" | "conflict";
  readonly message: string;
}

/**
 * The product being edited and what can happen to it: loading it (or starting a new one),
 * saving it whole under its version, and archiving it. A save based on an old version is
 * refused by the API (409): the person is told and offered the newer one, never merged.
 */
export function useProductEditor(
  productId: string,
  isNew: boolean,
  brandId: string | null,
  /** The sizes of the brand's other products, for a combo's rows; unknown until loaded. */
  sizesOf?: SizesOf,
) {
  const api = useApi();
  const { signedOut } = useSession();
  const [loaded, setLoaded] = useState<Loaded<true>>({ state: "loading" });
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [notice, setNotice] = useState<EditorNotice | null>(null);
  const [busy, setBusy] = useState(false);
  // A rule the server refused the save by, shown where it belongs until the next edit.
  const [refusal, setRefusal] = useState<DraftErrors | null>(null);

  const fail = useCallback(
    (failure: ApiFailure) => {
      if (isSignedOut(failure)) signedOut();
      setNotice({ kind: "error", message: failureMessage(failure) });
    },
    [signedOut],
  );

  const load = useCallback(async () => {
    setLoaded({ state: "loading" });
    setNotice(null);
    setAttempted(false);
    setRefusal(null);
    const result = await api.getProduct(productId);
    if (!result.ok) return setLoaded(loadFailure(result, signedOut));
    setDraft(draftOfDocument(result.value));
    setLoaded({ state: "ready", value: true });
  }, [api, productId, signedOut]);

  useEffect(() => {
    if (!isNew) return void load();
    if (brandId === null) return;
    setDraft(emptyDraft(productId, brandId));
    setLoaded({ state: "ready", value: true });
  }, [isNew, load, productId, brandId]);

  const check = useMemo(
    () => (draft === null ? null : checkProductDraft(draft, sizesOf)),
    [draft, sizesOf],
  );
  const edit = useCallback((change: DraftEdit) => {
    setRefusal(null);
    setDraft((current) => (current === null ? current : change(current)));
  }, []);

  async function save(): Promise<boolean> {
    if (draft === null || check === null) return false;
    setAttempted(true);
    if (!check.ok) {
      setNotice({ kind: "error", message: T.hasErrors });
      return false;
    }
    setBusy(true);
    const result = await api.putProduct(draft.id, check.body);
    setBusy(false);
    if (result.ok) {
      setDraft(draftOfDocument(result.value));
      setAttempted(false);
      setNotice({ kind: "ok", message: T.saved });
      return true;
    }
    if (result.status === 409 && result.code === VERSION_CONFLICT) {
      setNotice({ kind: "conflict", message: T.conflict });
    } else {
      setRefusal(serverRefusalErrors(result, draft.combo));
      fail(result);
    }
    return false;
  }

  async function archive(): Promise<boolean> {
    if (draft === null) return false;
    setBusy(true);
    const result = await api.archiveProduct(draft.id);
    setBusy(false);
    if (!result.ok) {
      fail(result);
      return false;
    }
    await load();
    setNotice({ kind: "ok", message: T.archived });
    return true;
  }

  const errors = { ...(attempted && check !== null && !check.ok ? check.errors : {}), ...refusal };
  const product = check?.ok === true ? check.product : null;
  return { loaded, draft, errors, product, notice, busy, edit, save, archive, reload: load };
}
