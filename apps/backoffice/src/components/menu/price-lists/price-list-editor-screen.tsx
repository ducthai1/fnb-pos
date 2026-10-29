"use client";

import { Plus, Tag } from "lucide-react";
import { useMemo } from "react";
import type { ApiResult } from "../../../lib/api/api-result";
import type { Category, ProductSummary } from "../../../lib/api/catalog-api";
import { vi } from "../../../messages/vi";
import { useApi } from "../../app/api-context";
import { LoadStateView } from "../../shell/load-state-view";
import { PageHeader } from "../../shell/page-header";
import { useSession } from "../../shell/session-context";
import { useApiLoad } from "../../shell/use-api-load";
import { EmptyState } from "../../ui/empty-state";
import { ErrorNotice, SuccessNotice } from "../../ui/error-notice";
import { Icon } from "../../ui/icon";
import { TextField } from "../../ui/text-field";
import { RuleCard } from "./rule-card";
import type { RuleChoices } from "./rule-fields";
import { usePriceListEditor } from "./use-price-list-editor";


const T = vi.priceLists.editor;

interface Menu {
  categories: Category[];
  products: ProductSummary[];
}

async function loadMenu(c: Promise<ApiResult<Category[]>>, p: Promise<ApiResult<ProductSummary[]>>): Promise<ApiResult<Menu>> {
  const [categories, products] = await Promise.all([c, p]);
  if (!categories.ok) return categories;
  if (!products.ok) return products;
  return { ok: true, value: { categories: categories.value, products: products.value } };
}

/** One price list on one page; `isNew` starts an empty one under `id`. */
export function PriceListEditorScreen({ id, isNew, onSaved }: { id: string; isNew: boolean; onSaved?: () => void }) {
  const api = useApi();
  const { branch, branches } = useSession();
  const brandId = branch?.brandId ?? null;
  const load = useMemo(
    () => (brandId === null ? null : () => loadMenu(api.listCategories(brandId), api.listProducts(brandId))),
    [api, brandId],
  );
  const [menu, reloadMenu] = useApiLoad(load);
  return (
    <section className="bo-stack" aria-labelledby="price-list-editor-title">
      <LoadStateView loaded={menu} retry={reloadMenu}>
        {({ categories, products }) => (
          <EditorBody
            id={id}
            isNew={isNew}
            brandId={brandId}
            onSaved={onSaved}
            choices={{ categories, products, branches: (branches ?? []).filter((b) => b.brandId === brandId) }}
          />
        )}
      </LoadStateView>
    </section>
  );
}

function EditorBody({
  id,
  isNew,
  brandId,
  choices,
  onSaved,
}: {
  id: string;
  isNew: boolean;
  brandId: string | null;
  choices: RuleChoices;
  onSaved: (() => void) | undefined;
}) {
  const productOf = useMemo(() => {
    const owner = new Map(choices.products.flatMap((p) => (p.variants ?? []).map((v) => [v.id, p.id] as const)));
    return (variantId: string) => owner.get(variantId);
  }, [choices.products]);
  const editor = usePriceListEditor(id, isNew, brandId, productOf);
  const { draft, notice, errors } = editor;
  const title = draft === null || draft.version === null ? T.newTitle : T.editTitle(draft.name);
  return (
    <>
      <PageHeader section="/menu/price-lists" trail={[{ label: draft === null || draft.version === null ? T.newTitle : draft.name }]} title={title} titleId="price-list-editor-title" />
      <LoadStateView loaded={editor.loaded} retry={() => void editor.reload()}>
        {() =>
          draft === null ? null : (
            <form
              className="bo-stack"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void editor.save().then((saved) => saved && onSaved?.());
              }}
            >
              <div className="bo-card bo-stack">
                <TextField label={T.nameLabel} value={draft.name} hint={T.nameHint} onChange={editor.rename} error={errors.name} />
              </div>
              <div className="bo-row bo-rules-head">
                <div className="bo-grow">
                  <h2 className="bo-subtitle">{T.rulesTitle}</h2>
                  <p className="bo-muted bo-wrap">{T.rulesHint}</p>
                </div>
                <button type="button" className="bo-button" onClick={editor.addRule}>
                  <Icon of={Plus} size={16} />
                  {T.addRule}
                </button>
              </div>
              {errors.rules !== undefined && <ErrorNotice message={errors.rules} />}
              {draft.rules.length === 0 && (
                <div className="bo-empty">
                  <EmptyState icon={Tag}>{T.noRules}</EmptyState>
                </div>
              )}
              <ol className="bo-stack bo-rule-list" aria-label={T.rulesTitle}>
                {draft.rules.map((rule, index) => (
                  <RuleCard
                    key={rule.key}
                    rule={rule}
                    number={index + 1}
                    choices={choices}
                    errors={errors}
                    edit={(patch) => editor.editRule(rule.key, patch)}
                    remove={() => editor.removeRule(rule.key)}
                  />
                ))}
              </ol>
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
                </div>
              </div>
            </form>
          )
        }
      </LoadStateView>
    </>
  );
}

