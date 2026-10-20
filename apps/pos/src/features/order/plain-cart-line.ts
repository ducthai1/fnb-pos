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

/** Whether a tap rings the product up at once, as a cashier expects of a bottle of water. */
export const needsNoChoice = (product: PosProduct): boolean =>
  product.variants.length === 0 && product.modifierGroups.length === 0;
