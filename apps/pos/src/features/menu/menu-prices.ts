import type { PosProduct } from "@fnb/contracts";
import { type MeasureUnit, type ResolvedUnitPrice, type Vnd, measureUnitOf, resolveUnitPrice } from "@fnb/domain";
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
  /** The price the cashier typed, for an open-price product (the domain refuses it elsewhere). */
  enteredPrice?: Vnd,
): ResolvedUnitPrice {
  return resolveUnitPrice({
    product,
    variantId,
    branchId: menu.branch.id,
    channelKey: COUNTER_CHANNEL,
    at,
    utcOffsetMinutes: menu.branch.utcOffsetMinutes,
    priceList: menu.priceItems,
    ...(enteredPrice === undefined ? {} : { enteredPrice }),
  });
}

/**
 * What a product's tile says it sells for: a price (per kg or per 100 g when sold by weight),
 * "type the price" for an open-price product, or null when it has no price to sell at.
 */
export type TilePrice =
  | { readonly kind: "price"; readonly amount: Vnd; readonly per: MeasureUnit | null }
  | { readonly kind: "typed" };

export function tilePriceOf(menu: TillMenu, product: PosProduct, at: number): TilePrice | null {
  if (product.pricingMode === "open_price") return { kind: "typed" };
  const amount = tilePrice(menu, product, at);
  return amount === null ? null : { kind: "price", amount, per: measureUnitOf(product) };
}

/** The price on a product's tile: its first variant's, or null when it has none. */
export function tilePrice(menu: TillMenu, product: PosProduct, at: number): Vnd | null {
  try {
    return unitPriceOf(menu, product, product.variants[0]?.id ?? null, at).unitPrice;
  } catch {
    return null;
  }
}
