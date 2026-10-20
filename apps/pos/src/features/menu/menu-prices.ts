import type { PosProduct } from "@fnb/contracts";
import { type ResolvedUnitPrice, type Vnd, resolveUnitPrice } from "@fnb/domain";
import type { TillMenu } from "./till-menu";

/** The counter sells on no delivery channel: its prices are the shop's own. */
export const COUNTER_CHANNEL: string | null = null;

/**
 * One unit of the product before options, priced by the domain exactly as the server will
 * price the draft line: the branch, the channel, the moment and the brand's price lists.
 * Throws the domain's error when the product or variant has no price.
 */
export function unitPriceOf(
  menu: TillMenu,
  product: PosProduct,
  variantId: string | null,
  at: number,
): ResolvedUnitPrice {
  return resolveUnitPrice({
    product,
    variantId,
    branchId: menu.branch.id,
    channelKey: COUNTER_CHANNEL,
    at,
    utcOffsetMinutes: menu.branch.utcOffsetMinutes,
    priceList: menu.priceItems,
  });
}

/** The price on a product's tile: its first variant's, or null when it has none. */
export function tilePrice(menu: TillMenu, product: PosProduct, at: number): Vnd | null {
  try {
    return unitPriceOf(menu, product, product.variants[0]?.id ?? null, at).unitPrice;
  } catch {
    return null;
  }
}
