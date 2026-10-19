import type { OrderChargeProfile, OrderTotals, OrderTotalsInput } from "./order-totals-types";
import { pricedOrderTotals } from "./priced-order-totals";
import { mirroredRefundLines, negateOrderTotals } from "./refund-mirror";

/**
 * Everything the bill shows, computed from the order lines alone: the POS (offline) and the
 * server run this on the same data and must agree to the đồng, so nothing here depends on line
 * order beyond tie-breaking which line receives a rounding đồng.
 *
 * An ordinary order is priced as the customer pays for it, its void lines folded into the items
 * they cancel. A refund (`refundOfOrderId` set) is priced as the mirror image of a sale and
 * comes out negative.
 */
export function computeOrderTotals(
  order: OrderTotalsInput,
  profile: OrderChargeProfile,
): OrderTotals {
  const refundOfOrderId = order.refundOfOrderId ?? null;
  if (refundOfOrderId === null) return pricedOrderTotals(order, profile);
  const mirrored = mirroredRefundLines(order.lines, refundOfOrderId);
  return negateOrderTotals(
    pricedOrderTotals({ lines: mirrored, serviceType: order.serviceType }, profile),
  );
}
