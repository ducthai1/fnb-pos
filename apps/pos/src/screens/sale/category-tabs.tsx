import type { PosCategory, PosProduct } from "@fnb/contracts";
import type { LucideIcon } from "lucide-react";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";
import { categoryIcon } from "./category-icon";
import { useProductPhoto } from "./product-photo";

export interface CategoryTabsProps {
  categories: readonly PosCategory[];
  products: readonly PosProduct[];
  tones: ReadonlyMap<string, number>;
  chosen: string | null;
  onChoose(categoryId: string | null): void;
}

/**
 * The menu's categories, each drawn with the photo of its first product that has one (so the
 * cashier knows it by sight before reading it) or, without any, an icon guessed from its name,
 * and how many products it holds: a row of chips that wraps on a phone, a column of round
 * photos beside the products on a tablet or a till.
 */
export function CategoryTabs({ categories, products, tones, chosen, onChoose }: CategoryTabsProps) {
  const counts = new Map<string, number>();
  const photos = new Map<string, string>();
  for (const product of products) {
    if (product.categoryId === null) continue;
    counts.set(product.categoryId, (counts.get(product.categoryId) ?? 0) + 1);
    if (product.imageUrl !== undefined && !photos.has(product.categoryId)) {
      photos.set(product.categoryId, product.imageUrl);
    }
  }
  const firstPhoto = products.find((product) => product.imageUrl !== undefined)?.imageUrl;
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
      <CategoryPhoto
        imageUrl={id === null ? firstPhoto : photos.get(id)}
        icon={categoryIcon(id === null ? null : name)}
      />
      <span className="pos-category__name">{name}</span>
      <span className="pos-category__count" aria-hidden>
        {vi.sale.productCount(count)}
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

/** A round photo of the category, or its icon on the category's colour until one is drawn. */
function CategoryPhoto({ imageUrl, icon }: { imageUrl: string | undefined; icon: LucideIcon }) {
  const photo = useProductPhoto(imageUrl);
  return (
    <span className="pos-category__photo" data-category-photo={photo.state} aria-hidden>
      {photo.src === null ? (
        <Icon of={icon} size={24} />
      ) : (
        <img src={photo.src} alt="" decoding="async" draggable={false} onError={photo.onError} />
      )}
    </span>
  );
}
