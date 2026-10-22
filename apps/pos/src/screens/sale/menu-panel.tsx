import type { PosProduct } from "@fnb/contracts";
import { Search, X } from "lucide-react";
import { useMemo, useRef } from "react";
import { useMenuPlaceState } from "../../features/menu/menu-memory";
import { COUNTER_CHANNEL } from "../../features/menu/menu-prices";
import { isSoldOut } from "../../features/menu/product-availability";
import { useBestSellerIds } from "../../features/menu/use-best-sellers";
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
  /** The order being rung up: back on it the menu is where it was, a new one clears the search. */
  orderId?: string;
  onPick(product: PosProduct): void;
}

const NOTHING: ReadonlyMap<string, number> = new Map();

/** Categories, a quick search and the products as tiles of one height; sold-out ones marked. */
export function MenuPanel({ menu, now, inCart = NOTHING, orderId, onPick }: MenuPanelProps) {
  const categoryIds = useMemo(
    () => menu.categories.map((category) => category.id),
    [menu.categories],
  );
  const { categoryId, setCategoryId, query, setQuery, anchor } = useMenuPlaceState(
    orderId,
    categoryIds,
  );
  const tones = useMemo(() => categoryTones(menu.categories), [menu.categories]);
  const best = useBestSellerIds();
  const shown = inCategoryOrder(productsShown(menu.products, categoryId, query), menu.categories);
  const soldOut = shown.filter((product) =>
    isSoldOut(menu.availability.get(product.id), COUNTER_CHANNEL, now),
  ).length;
  const search = useRef<HTMLInputElement>(null);
  useTillKey(vi.sale.keys.search, () => {
    search.current?.focus();
    search.current?.select();
  });
  return (
    <section ref={anchor} className="pos-menu" aria-label={vi.sale.menuLabel}>
      <CategoryTabs
        categories={menu.categories}
        products={menu.products}
        tones={tones}
        chosen={categoryId}
        onChoose={setCategoryId}
      />
      <div className="pos-menu__head">
        <h2 className="pos-menu__title">
          {vi.sale.menuLabel}{" "}
          <span className="pos-menu__count">{vi.sale.shownCount(shown.length, soldOut)}</span>
        </h2>
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
                bestSeller={best.has(product.id)}
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
