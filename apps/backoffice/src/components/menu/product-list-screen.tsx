"use client";

import { formatVnd, vnd } from "@fnb/domain";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ApiResult } from "../../lib/api/api-result";
import type { Category, ProductSummary } from "../../lib/api/catalog-api";
import { matchesSearch } from "../../lib/format/search-text";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { LoadStateView } from "../shell/load-state-view";
import { useSession } from "../shell/session-context";
import { useApiLoad } from "../shell/use-api-load";
import { CheckField } from "../ui/select-field";
import { TextField } from "../ui/text-field";
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
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [newProductId] = useState(newId);

  return (
    <section className="bo-stack" aria-labelledby="products-title">
      <h1 id="products-title" className="bo-title">
        {T.title}
      </h1>
      {branch === null ? (
        <p className="bo-muted">{vi.menu.chooseBranch}</p>
      ) : (
        <>
          <p className="bo-muted bo-wrap">{vi.menu.brandOf(branch.brandName)}</p>
          <div className="bo-row">
            <TextField label={T.search} value={search} type="search" onChange={setSearch} />
            <CheckField label={T.showArchived} checked={showArchived} onChange={setShowArchived} />
            <Link className="bo-button bo-button--primary" href={`/menu/products/${newProductId}?new=1`}>
              {T.add}
            </Link>
          </div>
          <LoadStateView loaded={loaded} retry={reload}>
            {({ products, categories }) => {
              const shown = products.filter(
                (product) => (showArchived || product.archivedAt === null) && matchesSearch(product.name, search),
              );
              if (products.length === 0) return <p className="bo-muted">{T.empty}</p>;
              if (shown.length === 0) return <p className="bo-muted">{T.noMatch}</p>;
              const categoryName = (id: string | null) =>
                categories.find((category) => category.id === id)?.name ?? T.noCategory;
              return (
                <table className="bo-table" aria-label={T.title}>
                  <thead>
                    <tr>
                      <th scope="col">{T.columns.name}</th>
                      <th scope="col">{T.columns.category}</th>
                      <th scope="col">{T.columns.price}</th>
                      <th scope="col">{T.columns.status}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((product) => (
                      <tr key={product.id}>
                        <td data-label={T.columns.name}>
                          <Link href={`/menu/products/${product.id}`} aria-label={T.edit(product.name)}>
                            {product.name}
                          </Link>
                        </td>
                        <td data-label={T.columns.category}>{categoryName(product.categoryId)}</td>
                        <td data-label={T.columns.price}>{priceOf(product)}</td>
                        <td data-label={T.columns.status}>{product.archivedAt === null ? "" : T.archived}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            }}
          </LoadStateView>
        </>
      )}
    </section>
  );
}
