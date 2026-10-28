import type { PosProduct } from "@fnb/contracts";
import { newId } from "../ids/new-id";
import type { CartLine } from "./counter-order";

/** A product with nothing to choose, as one tap rings it up: one unit, no options, no note. */
export const plainLine = (product: PosProduct): CartLine => ({
  lineId: newId(),
  productId: product.id,
  variantId: null,
  modifiers: [],
  quantity: 1,
  note: null,
});

/**
 * Whether a tap rings the product up at once, as a cashier expects of a bottle of water. A
 * combo always opens its picker, which shows what goes in it even when nothing is to choose.
 */
export const needsNoChoice = (product: PosProduct): boolean =>
  product.kind !== "combo" && product.variants.length === 0 && product.modifierGroups.length === 0;

/** What the cashier must type before the line goes on the order: its price, or its weight. */
export function entryNeeded(product: PosProduct): "price" | "weight" | null {
  if (product.pricingMode === "open_price") return "price";
  return product.pricingMode === "weighed" ? "weight" : null;
}
