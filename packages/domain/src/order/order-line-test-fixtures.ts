import { isDomainError } from "../errors";
import {
  type Quantity,
  type Vnd,
  addVnd,
  basisPoints,
  multiplyVndByQuantity,
  quantity,
  vnd,
} from "../money";
import { effectiveQuantity } from "./order-line-tree";
import type { Order, OrderLine, OrderLineType } from "./order-types";

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
    reversesLineId: null,
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

/** A negative root item taking back `qty` units (pass a negative quantity) of `reversesLineId`. */
export const reversal = (id: string, reversesLineId: string, qty: Quantity): OrderLine => ({
  ...line(id, "item", null, qty),
  reversesLineId,
});

/** An ordinary draft order; override any field, e.g. `{ status: "paid" }` or `refundOfOrderId`. */
export function order(lines: readonly OrderLine[], overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    status: "draft",
    serviceType: "dine_in",
    channelKey: null,
    businessDate: "2026-10-20",
    lines,
    version: 1,
    refundOfOrderId: null,
    ...overrides,
  };
}

/** What the lines are worth: unit price × effective quantity, so negative lines subtract. */
export function linesTotal(lines: readonly OrderLine[]): Vnd {
  const amounts = lines.map((l) =>
    multiplyVndByQuantity(l.unitPrice, effectiveQuantity(lines, l.id), "half-up"),
  );
  return addVnd(...amounts);
}

/** Hands out "new-1", "new-2", … the way a till hands out fresh UUIDv7s. */
export function sequentialIds(prefix = "new"): () => string {
  let next = 0;
  return () => `${prefix}-${++next}`;
}
