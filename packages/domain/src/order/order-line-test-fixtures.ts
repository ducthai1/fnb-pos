import { isDomainError } from "../errors";
import { type Quantity, basisPoints, quantity, vnd } from "../money";
import type { OrderLine, OrderLineType } from "./order-types";

/** Builds a plausible order line; only the tree shape and quantity matter to the tree rules. */
export function line(
  id: string,
  lineType: OrderLineType,
  parentLineId: string | null,
  qty: Quantity = quantity(1),
): OrderLine {
  return {
    id,
    parentLineId,
    lineType,
    productId: lineType === "item" || lineType === "combo_component" ? `product-${id}` : null,
    variantId: null,
    modifierOptionId: lineType === "modifier" ? `option-${id}` : null,
    nameSnapshot: `line ${id}`,
    unitPrice: vnd(lineType === "discount" ? -5_000 : 10_000),
    quantity: qty,
    taxRate: basisPoints(800),
    note: null,
    priceSource: "base",
  };
}

/** The DomainError code a call throws, or undefined when it does not throw. */
export function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return isDomainError(error) ? error.code : "not-a-domain-error";
  }
  return undefined;
}

export const item = (id: string, qty?: Quantity) => line(id, "item", null, qty);
