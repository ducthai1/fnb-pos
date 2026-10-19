import { DomainError } from "../errors";
import type { OrderChargeProfile, OrderTotals, OrderTotalsInput } from "./order-totals-types";
import { pricedOrderTotals } from "./priced-order-totals";
import { mirroredRefundLines, negateOrderTotals } from "./refund-mirror";
import { refundTotalsFromAmounts } from "./refund-totals-from-amounts";
import { TOTALS_ERROR_CODES } from "./totals-error-codes";

/**
 * Everything the bill shows, computed from the order lines alone: the POS (offline) and the
 * server run this on the same data and must agree to the đồng, so nothing here depends on line
 * order beyond tie-breaking which line receives a rounding đồng.
 *
 * An ordinary order is priced as the customer pays for it, its void lines folded into the items
 * they cancel. A refund (`refundOfOrderId` set) comes out negative: one built by buildRefund
 * reads the amounts it carries (its share of what the sale charged); one without them is priced
 * as the mirror image of a sale of its lines, which is what a refund of the whole order gives
 * back when the sale had no order discount.
 */
export function computeOrderTotals(
  order: OrderTotalsInput,
  profile: OrderChargeProfile,
): OrderTotals {
  const refundOfOrderId = order.refundOfOrderId ?? null;
  const amounts = order.refundAmounts ?? null;
  if (refundOfOrderId === null) {
    if (amounts !== null) {
      throw new DomainError(
        TOTALS_ERROR_CODES.mixedSaleAndRefund,
        "an ordinary order cannot carry refund amounts",
        { refundLineCount: amounts.lines.length },
      );
    }
    return pricedOrderTotals(order, profile);
  }
  if (amounts !== null) return refundTotalsFromAmounts(order.lines, refundOfOrderId, amounts);
  const mirrored = mirroredRefundLines(order.lines, refundOfOrderId);
  return negateOrderTotals(
    pricedOrderTotals({ lines: mirrored, serviceType: order.serviceType }, profile),
  );
}
