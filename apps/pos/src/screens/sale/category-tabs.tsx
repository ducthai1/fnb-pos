import type { PosCategory, PosProduct } from "@fnb/contracts";
import { vi } from "../../messages/vi";

export interface CategoryTabsProps {
  categories: readonly PosCategory[];
  products: readonly PosProduct[];
  tones: ReadonlyMap<string, number>;
  chosen: string | null;
  onChoose(categoryId: string | null): void;
}

/**
 * The menu's categories, each with its colour and how many products it holds: a row that
 * wraps on a phone or a tablet, a column beside the products on a till held sideways.
 */
export function CategoryTabs({ categories, products, tones, chosen, onChoose }: CategoryTabsProps) {
  const counts = new Map<string, number>();
  for (const product of products) {
    if (product.categoryId !== null) {
      counts.set(product.categoryId, (counts.get(product.categoryId) ?? 0) + 1);
    }
  }
  const tab = (id: string | null, name: string, count: number, tone: number) => (
    <button
      key={id ?? "all"}
      type="button"
      role="tab"
      aria-selected={chosen === id}
      className="pos-category"
      data-tone={tone}
      onClick={() => onChoose(id)}
    >
      <span className="pos-category__dot" aria-hidden />
      <span className="pos-category__name">{name}</span>
      <span className="pos-category__count" aria-hidden>
        {count}
      </span>
    </button>
  );
  return (
    <div className="pos-categories" role="tablist" aria-label={vi.sale.categoriesLabel}>
      {tab(null, vi.sale.allCategories, products.length, 0)}
      {categories.map((category) =>
        tab(category.id, category.name, counts.get(category.id) ?? 0, tones.get(category.id) ?? 0),
      )}
    </div>
  );
}
