"use client";

import { CupSoda, Download, FileUp, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ApiResult } from "../../lib/api/api-result";
import type { Category, ProductSummary } from "../../lib/api/catalog-api";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { LoadStateView } from "../shell/load-state-view";
import { PageHeader } from "../shell/page-header";
import { useSession } from "../shell/session-context";
import { useApiLoad } from "../shell/use-api-load";
import { DataTable } from "../ui/data-table";
import { EmptyState } from "../ui/empty-state";
import { ErrorNotice, SuccessNotice } from "../ui/error-notice";
import { Icon } from "../ui/icon";
import { CheckField } from "../ui/select-field";
import { downloadMenuSheet } from "./menu-import/download-menu-sheet";
import { ProductBulkMove } from "./product-bulk-move";
import { categoryFilters, columnsFor } from "./product-list-columns";
import { newId } from "./product-editor/product-draft";

const T = vi.menu.products;

interface ListPage {
  products: ProductSummary[];
  categories: Category[];
}

async function both(
  products: Promise<ApiResult<ProductSummary[]>>,
  categories: Promise<ApiResult<Category[]>>,
): Promise<ApiResult<ListPage>> {
  const [p, c] = await Promise.all([products, categories]);
  if (!p.ok) return p;
  if (!c.ok) return c;
  return { ok: true, value: { products: p.value, categories: c.value } };
}

/** The products of the brand the branch sells, searchable, archived ones on request. */
export function ProductListScreen() {
  const api = useApi();
  const { branch } = useSession();
  const brandId = branch?.brandId ?? null;
  const load = useMemo(
    () => (brandId === null ? null : () => both(api.listProducts(brandId), api.listCategories(brandId))),
    [api, brandId],
  );
  const [loaded, reload, refresh] = useApiLoad(load);
  const [showArchived, setShowArchived] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<{ message: string; failed: boolean } | null>(null);
  const [newProductId] = useState(newId);

  return (
    <section className="bo-stack" aria-labelledby="products-title">
      <PageHeader
        section="/menu"
        title={T.title}
        titleId="products-title"
        hint={branch === null ? undefined : vi.menu.brandOf(branch.brandName)}
        actions={
          branch !== null && (
            <>
              <Link className="bo-button" href="/menu/import">
                <Icon of={FileUp} />
                {vi.menuImport.open}
              </Link>
              <button
                type="button"
                className="bo-button"
                disabled={loaded.state !== "ready"}
                onClick={() => {
                  if (loaded.state === "ready") downloadMenuSheet(loaded.value.products, loaded.value.categories);
                }}
              >
                <Icon of={Download} />
                {vi.menuImport.export}
              </button>
              <Link className="bo-button bo-button--primary" href={`/menu/products/${newProductId}?new=1`}>
                <Icon of={Plus} />
                {T.add}
              </Link>
            </>
          )
        }
      />
      {branch === null ? (
        <p className="bo-muted">{vi.menu.chooseBranch}</p>
      ) : (
        <>
          <CheckField label={T.showArchived} checked={showArchived} onChange={setShowArchived} />
          <LoadStateView loaded={loaded} retry={reload}>
            {({ products, categories }) => {
              const listed = products.filter((product) => showArchived || product.archivedAt === null);
              const categoryName = (id: string | null) =>
                categories.find((category) => category.id === id)?.name ?? T.noCategory;
              const pickedIds = listed.filter((product) => picked.has(product.id)).map((product) => product.id);
              return (
                <>
                {notice !== null &&
                  (notice.failed ? <ErrorNotice message={notice.message} /> : <SuccessNotice message={notice.message} />)}
                {pickedIds.length > 0 && (
                  <ProductBulkMove
                    picked={pickedIds}
                    categories={categories}
                    onClear={() => setPicked(new Set())}
                    onMoved={(message, failed) => {
                      setNotice({ message, failed });
                      setPicked(new Set());
                      refresh();
                    }}
                  />
                )}
                <DataTable
                  label={T.title}
                  rows={listed}
                  rowKey={(product) => product.id}
                  columns={columnsFor(categoryName)}
                  search={{ label: T.search, text: (product) => product.name }}
                  filters={categoryFilters(listed, categories)}
                  filterLabel={T.columns.category}
                  empty={<EmptyState icon={CupSoda}>{products.length === 0 ? T.empty : T.noMatch}</EmptyState>}
                  selection={{
                    picked,
                    onPick: (next) => {
                      setPicked(next);
                      setNotice(null);
                    },
                    label: (product) => T.pick(product.name),
                    allLabel: T.pickAll,
                  }}
                />
                </>
              );
            }}
          </LoadStateView>
        </>
      )}
    </section>
  );
}
