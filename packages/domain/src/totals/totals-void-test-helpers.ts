import { isDomainError } from "../errors";
import { type Quantity, subtractQuantity } from "../money";
import { type Order, type OrderLine, reversedQuantityOf, subtreeOf, voidLine } from "../order";
import { sequentialIds } from "../order/order-line-test-fixtures";
import type { OrderTotals } from "./order-totals-types";

/** Cancels `units` of an item of which `sent` had gone to the kitchen, with a manager's approval. */
export function voidUnits(
  order: Order,
  lineId: string,
  units: Quantity,
  sent: Quantity,
  newLineId: () => string = sequentialIds("void"),
): Order {
  return voidLine(order, {
    lineId,
    quantity: units,
    reasonCode: "customer_changed_mind",
    staffId: "cashier-1",
    approvedByStaffId: "manager-1",
    sentQuantity: sent,
    newLineId,
    requireApprovalAfterSent: true,
  }).order;
}

/**
 * The order rung up as if the voided units had never been there: each item lowered by what its
 * void lines take back (gone with its children when nothing is left), the void lines dropped.
 */
export function withoutVoids(lines: readonly OrderLine[]): OrderLine[] {
  const dropped = new Set<string>();
  for (const line of lines) {
    const left = subtractQuantity(line.quantity, reversedQuantityOf(lines, line.id));
    if (line.reversesLineId !== null || left === 0n) {
      for (const gone of subtreeOf(lines, line.id)) dropped.add(gone.id);
    }
  }
  return lines
    .filter((line) => !dropped.has(line.id))
    .map((line) => ({
      ...line,
      quantity: subtractQuantity(line.quantity, reversedQuantityOf(lines, line.id)),
    }));
}

/** The totals without the per-line snapshot, whose rounding đồng may follow line order. */
export const orderLevel = (totals: OrderTotals) => ({ ...totals, lines: [] });

/** The order-level totals a call returns, or the DomainError code it throws. */
export function outcomeOf(fn: () => OrderTotals): { totals: unknown } | { code: string } {
  try {
    return { totals: orderLevel(fn()) };
  } catch (error) {
    if (isDomainError(error)) return { code: error.code };
    throw error;
  }
}
