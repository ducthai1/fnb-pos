"use client";

import { useMemo, useState } from "react";
import type { ApiResult } from "../../../lib/api/api-result";
import type { Category, Station } from "../../../lib/api/catalog-api";
import { vi } from "../../../messages/vi";
import { useApi } from "../../app/api-context";
import { LoadStateView } from "../../shell/load-state-view";
import { PageHeader } from "../../shell/page-header";
import { useSession } from "../../shell/session-context";
import { useApiLoad } from "../../shell/use-api-load";
import { ConfirmPanel } from "../../ui/confirm-panel";
import { ErrorNotice, SuccessNotice } from "../../ui/error-notice";
import { ProductEditorForm } from "./product-editor-form";
import { SelectionPreview } from "./selection-preview";
import { useProductEditor } from "./use-product-editor";

const T = vi.menu.editor;

interface Choices {
  categories: Category[];
  stations: Station[];
}

async function loadChoices(
  categories: Promise<ApiResult<Category[]>>,
  stations: Promise<ApiResult<Station[]>>,
): Promise<ApiResult<Choices>> {
  const [c, s] = await Promise.all([categories, stations]);
  if (!c.ok) return c;
  if (!s.ok) return s;
  return { ok: true, value: { categories: c.value, stations: s.value } };
}

/** One product on one page; `isNew` starts an empty one under `productId`. */
export function ProductEditorScreen({
  productId,
  isNew,
  onSaved,
}: {
  productId: string;
  isNew: boolean;
  /** After a save the product exists: the page drops its "new" marker. */
  onSaved?: () => void;
}) {
  const api = useApi();
  const { branch } = useSession();
  const editor = useProductEditor(productId, isNew, branch?.brandId ?? null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const brandId = editor.draft?.brandId ?? branch?.brandId ?? null;
  const branchId = branch?.id ?? null;
  const load = useMemo(
    () =>
      brandId === null || branchId === null
        ? null
        : () => loadChoices(api.listCategories(brandId), api.listStations(branchId)),
    [api, brandId, branchId],
  );
  const [choices, reloadChoices] = useApiLoad(load);
  const { draft, notice } = editor;

  return (
    <section className="bo-stack" aria-labelledby="product-editor-title">
      <PageHeader
        section="/menu"
        trail={[{ label: draft === null || draft.version === null ? T.newTitle : draft.name }]}
        title={draft === null || draft.version === null ? T.newTitle : T.editTitle(draft.name)}
        titleId="product-editor-title"
      />
      <LoadStateView loaded={editor.loaded} retry={() => void editor.reload()}>
        {() => (
          <LoadStateView loaded={choices} retry={reloadChoices}>
            {({ categories, stations }) =>
              draft === null ? null : (
                <div className="bo-editor">
                  <form
                    className="bo-stack"
                    noValidate
                    onSubmit={(event) => {
                      event.preventDefault();
                      void editor.save().then((saved) => saved && onSaved?.());
                    }}
                  >
                    {draft.archivedAt !== null && <p className="bo-notice bo-notice--warn">{T.archived}</p>}
                    <ProductEditorForm
                      draft={draft}
                      errors={editor.errors}
                      categories={categories}
                      stations={stations}
                      edit={editor.edit}
                    />
                    <div className="bo-card bo-save-bar">
                      {notice?.kind === "error" && <ErrorNotice message={notice.message} />}
                      {notice?.kind === "ok" && <SuccessNotice message={notice.message} />}
                      {notice?.kind === "conflict" && (
                        <div className="bo-stack" role="alert">
                          <p className="bo-notice bo-notice--warn">{notice.message}</p>
                          <button type="button" className="bo-button" onClick={() => void editor.reload()}>
                            {T.reload}
                          </button>
                        </div>
                      )}
                      <div className="bo-row">
                        <button type="submit" className="bo-button bo-button--primary" disabled={editor.busy}>
                          {editor.busy ? vi.common.saving : T.save}
                        </button>
                        {draft.version !== null && draft.archivedAt === null && (
                          <button type="button" className="bo-button bo-button--danger" onClick={() => setConfirmArchive(true)}>
                            {T.archive}
                          </button>
                        )}
                      </div>
                      {confirmArchive && (
                        <ConfirmPanel
                          title={T.archiveTitle(draft.name)}
                          hint={T.archiveHint}
                          confirmLabel={T.archive}
                          busyLabel={T.archiving}
                          busy={editor.busy}
                          error={null}
                          onCancel={() => setConfirmArchive(false)}
                          onConfirm={() => void editor.archive().then(() => setConfirmArchive(false))}
                        />
                      )}
                    </div>
                  </form>
                  <SelectionPreview product={editor.product} branchId={branchId ?? ""} />
                </div>
              )
            }
          </LoadStateView>
        )}
      </LoadStateView>
    </section>
  );
}
