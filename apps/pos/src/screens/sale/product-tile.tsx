import type { PosProduct } from "@fnb/contracts";
import { Flame, Plus } from "lucide-react";
import { COUNTER_CHANNEL, tilePriceOf } from "../../features/menu/menu-prices";
import { isSoldOut } from "../../features/menu/product-availability";
import type { TillMenu } from "../../features/menu/till-menu";
import { vi } from "../../messages/vi";
import { Icon } from "../shared/icon";
import { ProductMark } from "./product-photo";
import { tilePriceText } from "./tile-price-text";

export interface ProductTileProps {
  menu: TillMenu;
  product: PosProduct;
  /** The colour of the product's category, 0 when it has none. */
  tone: number;
  /** Units of it already on the order, shown on the tile so a tap is seen to count. */
  inCart: number;
  /** One of the till's best sellers: marked on its photo. */
  bestSeller?: boolean;
  now: number;
  onPick(product: PosProduct): void;
}

/**
 * One product on a card of paper: its photo, or its category's colour with its initials, then
 * its name (two lines, the rest cut) and its price, with a round "+" that says a tap adds it.
 * Every tile is the same height so the grid reads in rows.
 */
export function ProductTile({
  menu,
  product,
  tone,
  inCart,
  bestSeller = false,
  now,
  onPick,
}: ProductTileProps) {
  const soldOut = isSoldOut(menu.availability.get(product.id), COUNTER_CHANNEL, now);
  const price = tilePriceOf(menu, product, now);
  const unavailable = soldOut || price === null;
  return (
    <button
      type="button"
      className="pos-product"
      data-sold-out={soldOut}
      data-tone={tone}
      // A sold-out tile cannot be tapped at all: the server would refuse the line anyway.
      disabled={unavailable}
      onClick={() => onPick(product)}
    >
      <ProductMark className="pos-product__thumb" name={product.name} imageUrl={product.imageUrl} />
      <span className="pos-product__body">
        <span className="pos-product__name">{product.name}</span>
        <span
          className="pos-product__price"
          data-no-price={price === null}
          data-price-kind={price?.kind === "typed" ? "typed" : price?.per ? "weighed" : undefined}
        >
          {tilePriceText(price)}
        </span>
      </span>
      {/* After the name, so the tile is still named by it first; drawn over the mark. */}
      {soldOut ? <span className="pos-product__flag">{vi.sale.soldOut}</span> : null}
      {/* A hint for the eye, like the count: what is read out is the name and the price. */}
      {bestSeller && !unavailable ? (
        <span className="pos-product__hot" aria-hidden data-best-seller>
          <Icon of={Flame} size={14} />
          {vi.sale.bestSeller}
        </span>
      ) : null}
      {/* The order already reads out its lines; this is for the eye. */}
      {inCart > 0 ? (
        <span className="pos-product__count" aria-hidden data-in-cart={inCart}>
          {inCart}
        </span>
      ) : null}
      {unavailable ? null : (
        <span className="pos-product__add" aria-hidden>
          <Icon of={Plus} size={18} />
        </span>
      )}
    </button>
  );
}
