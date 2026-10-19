import { quantity, vnd } from "../money";
import { item, line, order, reversal, sequentialIds } from "./order-line-test-fixtures";
import type { Order, OrderLine } from "./order-types";
import type { VoidLineRequest } from "./void-order-line";

const pearl: OrderLine = {
  ...line("pearl", "modifier", "tea", quantity(2)),
  unitPrice: vnd(5_000),
};

/**
 * Two milk teas at 10.000 đ with two pearl portions each at 5.000 đ, and a coffee at
 * 10.000 đ: worth 50.000 đ. Frozen so any in-place change throws instead of passing unnoticed.
 */
export function milkTeaDraft(extraLines: readonly OrderLine[] = []): Order {
  const lines = [item("tea", quantity(2)), pearl, item("coffee"), ...extraLines];
  return Object.freeze(order(Object.freeze(lines.map((l) => Object.freeze(l))), { version: 4 }));
}

/** A negative line taking back `units` sent teas of milkTeaDraft, with its copy of the pearls. */
export const teaCancel = (id: string, units: number): OrderLine[] => [
  reversal(id, "tea", quantity(-units)),
  { ...pearl, id: `${id}-pearl`, parentLineId: id },
];

/** Cancels one tea the kitchen has not seen, by a cashier, at a branch that wants approvals. */
export function voidRequest(overrides: Partial<VoidLineRequest> = {}): VoidLineRequest {
  return {
    lineId: "tea",
    quantity: quantity(1),
    reasonCode: "customer_changed_mind",
    staffId: "cashier-1",
    approvedByStaffId: null,
    sentQuantity: quantity(0),
    newLineId: sequentialIds(),
    requireApprovalAfterSent: true,
    ...overrides,
  };
}
