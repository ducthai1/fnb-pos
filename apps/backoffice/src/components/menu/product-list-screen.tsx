"use client";

import { formatVnd, vnd } from "@fnb/domain";
import { CupSoda, Download, FileUp, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ApiResult } from "../../lib/api/api-result";
import type { Category, ProductSummary } from "../../lib/api/catalog-api";
import { nameMark } from "../../lib/format/name-mark";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { LoadStateView } from "../shell/load-state-view";
import { PageHeader } from "../shell/page-header";
import { useSession } from "../shell/session-context";
import { useApiLoad } from "../shell/use-api-load";
import { type DataColumn, DataTable } from "../ui/data-table";
import { EmptyState } from "../ui/empty-state";
import { Icon } from "../ui/icon";
import { CheckField } from "../ui/select-field";
import { downloadMenuSheet } from "./menu-import/download-menu-sheet";
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

const priceOf = (product: ProductSummary) =>
  product.pricingMode === "open_price" || product.basePrice === null
    ? T.openPrice
    : formatVnd(vnd(product.basePrice));

const columnsFor = (categoryName: (id: string | null) => string): readonly DataColumn<ProductSummary>[] => [
  {
    key: "name",
    label: T.columns.name,
    cell: (product) => (
      <Link href={`/menu/products/${product.id}`} aria-label={T.edit(product.name)} className="bo-product-cell">
        <span className="bo-mark" data-initial={nameMark(product.name)} aria-hidden="true" />
        <span className="bo-wrap">{product.name}</span>
      </Link>
    ),
    sortValue: (product) => product.name,
  },
  {
    key: "category",
    label: T.columns.category,
    cell: (product) => categoryName(product.categoryId),
    sortValue: (product) => categoryName(product.categoryId),
  },
  {
    key: "price",
    label: T.columns.price,
    numeric: true,
    cell: priceOf,
    sortValue: (product) => (product.pricingMode === "open_price" ? null : product.basePrice),
  },
  {
    key: "status",
    label: T.columns.status,
    cell: (product) =>
      product.archivedAt === null ? (
        <span className="bo-badge" data-tone="ok">
          {T.selling}
        </span>
      ) : (
        <span className="bo-badge">{T.archived}</span>
      ),
  },
];

/** One filter per category that has a product on the list, in the menu's order. */
const categoryFilters = (products: readonly ProductSummary[], categories: readonly Category[]) =>
  [...categories]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((category) => products.some((product) => product.categoryId === category.id))
    .map((category) => ({
      key: category.id,
      label: category.name,
      test: (product: ProductSummary) => product.categoryId === category.id,
    }));

/** The products of the brand the branch sells, searchable, archived ones on request. */
export function ProductListScreen() {
  const api = useApi();
  const { branch } = useSession();
  const brandId = branch?.brandId ?? null;
  const load = useMemo(
    () => (brandId === null ? null : () => both(api.listProducts(brandId), api.listCategories(brandId))),
    [api, brandId],
  );
  const [loaded, reload] = useApiLoad(load);
  const [showArchived, setShowArchived] = useState(false);
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
              return (
                <DataTable
                  label={T.title}
                  rows={listed}
                  rowKey={(product) => product.id}
                  columns={columnsFor(categoryName)}
                  search={{ label: T.search, text: (product) => product.name }}
                  filters={categoryFilters(listed, categories)}
                  empty={<EmptyState icon={CupSoda}>{products.length === 0 ? T.empty : T.noMatch}</EmptyState>}
                />
              );
            }}
          </LoadStateView>
        </>
      )}
    </section>
  );
}
