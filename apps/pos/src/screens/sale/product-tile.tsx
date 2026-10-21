import type { PosProduct } from "@fnb/contracts";
import { formatVnd } from "@fnb/domain";
import { COUNTER_CHANNEL, tilePrice } from "../../features/menu/menu-prices";
import { isSoldOut } from "../../features/menu/product-availability";
import type { TillMenu } from "../../features/menu/till-menu";
import { vi } from "../../messages/vi";
import { productMark } from "./product-mark";

export interface ProductTileProps {
  menu: TillMenu;
  product: PosProduct;
  /** The colour of the product's category, 0 when it has none. */
  tone: number;
  /** Units of it already on the order, shown on the tile so a tap is seen to count. */
  inCart: number;
  now: number;
  onPick(product: PosProduct): void;
}

/**
 * One product: its category's colour where a photo would be, then a white body with its name
 * (two lines, the rest cut) and its price. Every tile is the same height so the grid reads
 * in rows.
 */
export function ProductTile({ menu, product, tone, inCart, now, onPick }: ProductTileProps) {
  const soldOut = isSoldOut(menu.availability.get(product.id), COUNTER_CHANNEL, now);
  const price = tilePrice(menu, product, now);
  return (
    <button
      type="button"
      className="pos-product"
      data-sold-out={soldOut}
      data-tone={tone}
      // A sold-out tile cannot be tapped at all: the server would refuse the line anyway.
      disabled={soldOut || price === null}
      onClick={() => onPick(product)}
    >
      <span className="pos-product__thumb" data-initial={productMark(product.name)} aria-hidden />
      <span className="pos-product__body">
        <span className="pos-product__name">{product.name}</span>
        <span className="pos-product__price" data-no-price={price === null}>
          {price === null ? vi.sale.noPrice : formatVnd(price)}
        </span>
      </span>
      {/* After the name, so the tile is still named by it first; drawn over the mark. */}
      {soldOut ? <span className="pos-product__flag">{vi.sale.soldOut}</span> : null}
      {/* The order already reads out its lines; this is for the eye. */}
      {inCart > 0 ? (
        <span className="pos-product__count" aria-hidden data-in-cart={inCart}>
          {inCart}
        </span>
      ) : null}
    </button>
  );
}
