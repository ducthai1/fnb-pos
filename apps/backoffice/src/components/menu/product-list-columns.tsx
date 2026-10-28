import { formatVnd, vnd } from "@fnb/domain";
import Link from "next/link";
import type { Category, ProductSummary } from "../../lib/api/catalog-api";
import { ProductListPhoto } from "./product-list-photo";
import { vi } from "../../messages/vi";
import type { DataColumn } from "../ui/data-table";

const T = vi.menu.products;

/** A weighed product's price says what it is per: "32.000 ₫ / 100 g". */
function priceOf(product: ProductSummary): string {
  if (product.pricingMode === "open_price" || product.basePrice === null) return T.openPrice;
  const price = formatVnd(vnd(product.basePrice));
  const unit = product.pricingMode === "weighed" ? product.measureUnit : null;
  return unit === "kg" || unit === "100g" ? T.pricePer(price, T.units[unit]) : price;
}

export const columnsFor = (categoryName: (id: string | null) => string): readonly DataColumn<ProductSummary>[] => [
  {
    key: "name",
    label: T.columns.name,
    cell: (product) => (
      <Link href={`/menu/products/${product.id}`} aria-label={T.edit(product.name)} className="bo-product-cell">
        <ProductListPhoto name={product.name} imageUrl={product.imageUrl} />
        <span className="bo-wrap">{product.name}</span>
      </Link>
    ),
    sortValue: (product) => product.name,
  },
  {
    key: "category",
    label: T.columns.category,
    width: "24%",
    cell: (product) => categoryName(product.categoryId),
    sortValue: (product) => categoryName(product.categoryId),
  },
  {
    key: "price",
    label: T.columns.price,
    numeric: true,
    width: "18%",
    cell: priceOf,
    sortValue: (product) => (product.pricingMode === "open_price" ? null : product.basePrice),
  },
  {
    key: "status",
    label: T.columns.status,
    width: "20%",
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
export const categoryFilters = (products: readonly ProductSummary[], categories: readonly Category[]) =>
  [...categories]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((category) => products.some((product) => product.categoryId === category.id))
    .map((category) => ({
      key: category.id,
      label: category.name,
      test: (product: ProductSummary) => product.categoryId === category.id,
    }));
