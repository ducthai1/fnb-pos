import { quantity } from "../money";
import type { RefundRequestLine } from "./build-refund-order";
import { order, reversal } from "./order-line-test-fixtures";
import type { Order, OrderLine, OrderStatus } from "./order-types";
import { milkTeaDraft } from "./void-order-line-test-fixtures";

/** The milk tea order (50.000 đ) paid on 2026-10-19 for a Grab takeaway; frozen. */
export function paidMilkTea(extraLines: readonly OrderLine[] = []): Order {
  const sold = milkTeaDraft(extraLines);
  return Object.freeze({
    ...sold,
    status: "paid" as const,
    serviceType: "takeaway" as const,
    channelKey: "grab",
    businessDate: "2026-10-19",
  });
}

/** An earlier refund of `units` teas from paidMilkTea, in the given state. */
export function earlierRefund(
  units: number,
  status: OrderStatus = "draft",
  id = "refund-0",
): Order {
  const lines = [reversal(`${id}-tea`, "tea", quantity(-units))];
  return Object.freeze(order(lines, { id, status, refundOfOrderId: "order-1" }));
}

export const teas = (units: number, restock = true): RefundRequestLine => ({
  lineId: "tea",
  quantity: quantity(units),
  restock,
});
