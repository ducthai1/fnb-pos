import type { PosProduct } from "@fnb/contracts";
import { formatVnd } from "@fnb/domain";
import { useState } from "react";
import { COUNTER_CHANNEL, tilePrice } from "../../features/menu/menu-prices";
import { isSoldOut } from "../../features/menu/product-availability";
import { productsShown } from "../../features/menu/search-products";
import type { TillMenu } from "../../features/menu/till-menu";
import { vi } from "../../messages/vi";

export interface MenuPanelProps {
  menu: TillMenu;
  /** The till's clock: prices and sold-out ends are read at this moment. */
  now: number;
  onPick(product: PosProduct): void;
}

/** Category tabs, a quick search and the products as big tiles; sold-out ones greyed out. */
export function MenuPanel({ menu, now, onPick }: MenuPanelProps) {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const shown = productsShown(menu.products, categoryId, query);
  const tab = (id: string | null, name: string) => (
    <button
      key={id ?? "all"}
      type="button"
      role="tab"
      aria-selected={categoryId === id}
      className="pos-tab pos-wrap"
      onClick={() => setCategoryId(id)}
    >
      {name}
    </button>
  );
  return (
    <section className="pos-menu" aria-label={vi.sale.menuLabel}>
      <input
        className="pos-input"
        type="search"
        aria-label={vi.sale.search}
        placeholder={vi.sale.searchPlaceholder}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="pos-tabs" role="tablist">
        {tab(null, vi.sale.allCategories)}
        {menu.categories.map((category) => tab(category.id, category.name))}
      </div>
      {shown.length === 0 ? (
        <p className="pos-hint">{query === "" ? vi.sale.emptyMenu : vi.sale.noMatch}</p>
      ) : (
        <ul className="pos-product-grid">
          {shown.map((product) => (
            <li key={product.id}>
              <ProductTile menu={menu} product={product} now={now} onPick={onPick} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProductTile(
  props: { menu: TillMenu; product: PosProduct; now: number } & Pick<MenuPanelProps, "onPick">,
) {
  const { menu, product, now } = props;
  const soldOut = isSoldOut(menu.availability.get(product.id), COUNTER_CHANNEL, now);
  const price = tilePrice(menu, product, now);
  return (
    <button
      type="button"
      className="pos-product"
      data-sold-out={soldOut}
      // A sold-out tile cannot be tapped at all: the server would refuse the line anyway.
      disabled={soldOut || price === null}
      onClick={() => props.onPick(product)}
    >
      <span className="pos-product__name pos-wrap">{product.name}</span>
      <span className="pos-product__price">
        {price === null ? vi.sale.noPrice : formatVnd(price)}
      </span>
      {soldOut ? <span className="pos-product__flag">{vi.sale.soldOut}</span> : null}
    </button>
  );
}
