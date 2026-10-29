"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApiFailure } from "../../../lib/api/api-result";
import { checkPriceListDraft, fieldOfRefusal, rulePath } from "../../../lib/catalog/price-list/check-price-list-draft";
import { type PriceListDraft, type ProductOfVariant, draftOfDocument, emptyListDraft, emptyRule } from "../../../lib/catalog/price-list/price-list-draft";
import { failureMessage, isSignedOut, messageForCode } from "../../../lib/errors/failure-message";
import { vi } from "../../../messages/vi";
import { useApi } from "../../app/api-context";
import { useSession } from "../../shell/session-context";
import { type Loaded, loadFailure } from "../../shell/use-api-load";
import { newId } from "../product-editor/product-draft";

const T = vi.priceLists.editor;

export interface EditorNotice {
  readonly kind: "error" | "ok" | "conflict";
  readonly message: string;
}

/**
 * The price list being edited and what can happen to it: loading it (or starting an empty
 * one), saving it whole under its version, and, when the API refuses a save by a pricing
 * rule only it could judge, showing the refusal on the rule it names. A save based on an old
 * version is refused (409): the person is told and offered the newer one, never merged.
 */
export function usePriceListEditor(id: string, isNew: boolean, brandId: string | null, productOf: ProductOfVariant) {
  // `productOf` must be stable for the life of the editor: a new one would reload the list.
  const api = useApi();
  const { signedOut } = useSession();
  const [loaded, setLoaded] = useState<Loaded<true>>({ state: "loading" });
  const [draft, setDraft] = useState<PriceListDraft | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [notice, setNotice] = useState<EditorNotice | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Readonly<Record<string, string>> | null>(null);

  const load = useCallback(async () => {
    setLoaded({ state: "loading" });
    setNotice(null);
    setAttempted(false);
    setRefusal(null);
    const result = await api.getPriceList(id);
    if (!result.ok) return setLoaded(loadFailure(result, signedOut));
    setDraft(draftOfDocument(result.value, productOf));
    setLoaded({ state: "ready", value: true });
  }, [api, id, signedOut, productOf]);

  useEffect(() => {
    if (!isNew) return void load();
    if (brandId === null) return;
    setDraft(emptyListDraft(id, brandId));
    setLoaded({ state: "ready", value: true });
  }, [isNew, load, id, brandId]);

  const check = useMemo(() => (draft === null ? null : checkPriceListDraft(draft)), [draft]);
  const edit = useCallback((change: (current: PriceListDraft) => PriceListDraft) => {
    setRefusal(null);
    setDraft((current) => (current === null ? current : change(current)));
  }, []);
  const editRule = useCallback(
    (key: string, patch: Partial<PriceListDraft["rules"][number]>) =>
      edit((d) => ({ ...d, rules: d.rules.map((rule) => (rule.key === key ? { ...rule, ...patch } : rule)) })),
    [edit],
  );
  const addRule = useCallback(() => edit((d) => ({ ...d, rules: [...d.rules, emptyRule(newId())] })), [edit]);
  const removeRule = useCallback((key: string) => edit((d) => ({ ...d, rules: d.rules.filter((r) => r.key !== key) })), [edit]);
  const rename = useCallback((name: string) => edit((d) => ({ ...d, name })), [edit]);

  async function save(): Promise<boolean> {
    if (draft === null || check === null) return false;
    setAttempted(true);
    if (!check.ok) {
      setNotice({ kind: "error", message: T.hasErrors });
      return false;
    }
    setBusy(true);
    const result = await api.putPriceList(draft.id, check.body);
    setBusy(false);
    if (result.ok) {
      setDraft(draftOfDocument(result.value, productOf));
      setAttempted(false);
      setNotice({ kind: "ok", message: T.saved });
      return true;
    }
    if (result.status === 409 && result.code === "API_CATALOG_VERSION_CONFLICT") {
      setNotice({ kind: "conflict", message: T.conflict });
      return false;
    }
    if (isSignedOut(result)) signedOut();
    setRefusal(refusalErrors(result));
    setNotice({ kind: "error", message: failureMessage(result) });
    return false;
  }

  const errors = { ...(attempted && check !== null && !check.ok ? check.errors : {}), ...refusal };
  return { loaded, draft, errors, notice, busy, save, reload: load, rename, editRule, addRule, removeRule };
}

/** A pricing rule the API refused, placed on the rule it names (its details carry the id). */
function refusalErrors(failure: ApiFailure): Readonly<Record<string, string>> | null {
  const body = failure.body;
  const details = typeof body === "object" && body !== null ? (body as { details?: unknown }).details : undefined;
  const key = typeof details === "object" && details !== null ? (details as { priceListItemId?: unknown }).priceListItemId : undefined;
  if (failure.status !== 400 || failure.code === null || typeof key !== "string") return null;
  return { [rulePath(key, fieldOfRefusal(failure.code))]: messageForCode(failure.code) };
}
