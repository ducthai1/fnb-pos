import {
  type LineTotals,
  type OrderLine,
  type OrderTotals,
  type Quantity,
  compareQuantity,
  computeOrderTotals,
  effectiveQuantities,
  linesNetOfVoids,
  quantity,
} from "@fnb/domain";
import type { StoredOrder } from "../sync/stored-order";

/** A goods line as it was sold: the line rung up, the units paid for, and its amounts. */
export interface SoldLine {
  readonly line: OrderLine;
  /** Units the customer paid for, voided units left out; negative on a refund. */
  readonly quantity: Quantity;
  readonly amounts: LineTotals;
}

export interface SoldOrder {
  readonly totals: OrderTotals;
  readonly lines: readonly SoldLine[];
}

const NONE = quantity(0);

/**
 * The order's totals, computed by the domain from the order as stored (its own charge
 * profile, a refund's own amounts), and its goods lines with the units each one sold. A
 * cancelled unit is no sale: a void line and an item voided down to nothing are left out,
 * and a partly voided item counts the units left, its toppings with it. Invoices and the
 * daily report both read this, so they cannot disagree about what a line sold.
 */
export function soldOrderOf(stored: Pick<StoredOrder, "order" | "chargeProfile">): SoldOrder {
  const { order } = stored;
  const totals = computeOrderTotals(order, stored.chargeProfile);
  // A refund's negative items reverse lines of the sale, not of the refund: they are its
  // goods, not voids to fold away.
  const priced = order.refundOfOrderId === null ? linesNetOfVoids(order.lines).priced : order.lines;
  const units = effectiveQuantities(priced);
  const byId = new Map(order.lines.map((line) => [line.id, line]));
  const lines = totals.lines.flatMap((amounts): SoldLine[] => {
    const line = byId.get(amounts.lineId);
    const sold = units.get(amounts.lineId);
    if (line === undefined || sold === undefined || compareQuantity(sold, NONE) === 0) return [];
    return [{ line, quantity: sold, amounts }];
  });
  return { totals, lines };
}
