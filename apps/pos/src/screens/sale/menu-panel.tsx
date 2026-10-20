import type { PosProduct } from "@fnb/contracts";
import { Search, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { productsShown } from "../../features/menu/search-products";
import type { TillMenu } from "../../features/menu/till-menu";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";
import { EmptyState } from "../shared/state-view";
import { useTillKey } from "../shared/use-till-key";
import { CategoryTabs } from "./category-tabs";
import { categoryTones, inCategoryOrder } from "./product-mark";
import { ProductTile } from "./product-tile";

export interface MenuPanelProps {
  menu: TillMenu;
  /** The till's clock: prices and sold-out ends are read at this moment. */
  now: number;
  /** Units of each product on the order, by product id. */
  inCart?: ReadonlyMap<string, number>;
  onPick(product: PosProduct): void;
}

const NOTHING: ReadonlyMap<string, number> = new Map();

/** Categories, a quick search and the products as tiles of one height; sold-out ones marked. */
export function MenuPanel({ menu, now, inCart = NOTHING, onPick }: MenuPanelProps) {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const tones = useMemo(() => categoryTones(menu.categories), [menu.categories]);
  const shown = inCategoryOrder(productsShown(menu.products, categoryId, query), menu.categories);
  const search = useRef<HTMLInputElement>(null);
  useTillKey(vi.sale.keys.search, () => {
    search.current?.focus();
    search.current?.select();
  });
  return (
    <section className="pos-menu" aria-label={vi.sale.menuLabel}>
      <CategoryTabs
        categories={menu.categories}
        products={menu.products}
        tones={tones}
        chosen={categoryId}
        onChoose={setCategoryId}
      />
      <div className="pos-search">
        <Icon of={Search} />
        <input
          ref={search}
          className="pos-input pos-search__input"
          type="search"
          aria-label={vi.sale.search}
          placeholder={vi.sale.searchPlaceholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query === "" ? (
          <kbd className="pos-kbd" aria-hidden>
            {vi.sale.keys.search}
          </kbd>
        ) : (
          <button
            type="button"
            className="pos-search__clear"
            aria-label={vi.sale.clearSearch}
            onClick={() => setQuery("")}
          >
            <Icon of={X} />
          </button>
        )}
      </div>
      {shown.length === 0 ? (
        <div className="pos-menu__empty">
          <EmptyState title={query === "" ? vi.sale.emptyMenu : vi.sale.noMatch} />
        </div>
      ) : (
        <ul className="pos-product-grid">
          {shown.map((product) => (
            <li key={product.id}>
              <ProductTile
                menu={menu}
                product={product}
                tone={product.categoryId === null ? 0 : (tones.get(product.categoryId) ?? 0)}
                inCart={inCart.get(product.id) ?? 0}
                now={now}
                onPick={onPick}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
