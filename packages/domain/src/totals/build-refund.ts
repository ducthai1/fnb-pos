import { DomainError } from "../errors";
import { type Quantity, basisPoints, negateQuantity, quantity, subtractQuantity } from "../money";
import {
  type BuiltRefund,
  type Order,
  type RefundIds,
  type RefundLineAmounts,
  type RefundRequestLine,
  reversedQuantityOf,
  subtreeOf,
} from "../order";
import { buildRefundLines } from "../order/build-refund-order";
import type { OrderChargeProfile } from "./order-totals-types";
import {
  type LineCharges,
  chargesBySoldLine,
  chargesGivenBack,
  refundLineAmounts,
  shareOfCharges,
  subtractCharges,
} from "./refund-charges-of-sale";
import { TOTALS_ERROR_CODES } from "./totals-error-codes";

/**
 * Builds a refund for part or all of a paid order (lines as in buildRefundLines) together with
 * what it gives back: for each refunded unit, its share of what the sale charged for that line,
 * order discount, tax and service charge included, after what earlier refunds already took. So
 * a partial refund of a discounted order gives back the discounted price, refunding everything
 * (at once or bit by bit) gives back exactly what the sale charged, and no refund gives back
 * more than was paid for what has been refunded so far. computeOrderTotals of the refund then
 * reads those amounts.
 *
 * `profile` is the charge profile the sale was priced with, not the branch's current one: a
 * refund mirrors the sale. Earlier refunds that still count (drafts included) must carry their
 * amounts, i.e. come from this function, or what they took back is unknown.
 */
export function buildRefund(
  paidOrder: Order,
  request: readonly RefundRequestLine[],
  existingRefunds: readonly Order[],
  ids: RefundIds,
  businessDate: string,
  profile: OrderChargeProfile,
): BuiltRefund {
  const built = buildRefundLines(paidOrder, request, existingRefunds, ids, businessDate);
  const live = existingRefunds.filter((refund) => refund.status !== "cancelled");
  const left = chargesBySoldLine(paidOrder, profile);
  for (const refund of live) takeBack(left, refund);

  const liveLines = live.flatMap((refund) => refund.lines);
  const unitsLeft = new Map<string, Quantity>();
  const amounts: RefundLineAmounts[] = [];
  for (const head of built.order.lines) {
    if (head.reversesLineId === null) continue;
    const soldId = head.reversesLineId;
    const units = negateQuantity(head.quantity);
    const before = unitsLeft.get(soldId) ?? unitsNotRefunded(paidOrder, liveLines, soldId);
    for (const line of subtreeOf(built.order.lines, head.id)) {
      if (line.lineType === "discount") continue;
      const soldLineId = built.soldLineIdByLineId.get(line.id) ?? line.id;
      const charges = left.get(soldLineId);
      if (!charges) continue; // every copy comes from a goods line of the paid order
      const share = shareOfCharges(charges, units, before);
      left.set(soldLineId, subtractCharges(charges, share));
      amounts.push(refundLineAmounts(line.id, soldLineId, share));
    }
    unitsLeft.set(soldId, subtractQuantity(before, units));
  }
  const refundAmounts = {
    pricesIncludeTax: profile.pricesIncludeTax,
    serviceChargeTaxRate: profile.serviceCharge?.taxRate ?? basisPoints(0),
    lines: amounts,
  };
  return { order: { ...built.order, refundAmounts }, restockByLineId: built.restockByLineId };
}

/** Units of a sold item the customer paid for and no earlier refund that counts has taken. */
function unitsNotRefunded(paidOrder: Order, liveLines: Order["lines"], soldId: string): Quantity {
  // buildRefundLines found the sold item and checked the refund fits in what is left of it
  const sold = paidOrder.lines.find((line) => line.id === soldId)?.quantity ?? quantity(0);
  const voided = reversedQuantityOf(paidOrder.lines, soldId);
  return subtractQuantity(subtractQuantity(sold, voided), reversedQuantityOf(liveLines, soldId));
}

function takeBack(left: Map<string, LineCharges>, refund: Order): void {
  if (refund.refundAmounts === null) {
    throw new DomainError(
      TOTALS_ERROR_CODES.earlierRefundWithoutAmounts,
      `earlier refund ${refund.id} carries no amounts, so what it gave back is unknown`,
      { refundId: refund.id },
    );
  }
  for (const given of refund.refundAmounts.lines) {
    const charges = left.get(given.soldLineId);
    if (!charges) {
      throw new DomainError(
        TOTALS_ERROR_CODES.invalidRefundAmounts,
        `earlier refund ${refund.id} gives back line ${given.soldLineId}, which was not sold`,
        { refundId: refund.id, lineId: given.lineId, reason: "unknown_sold_line" },
      );
    }
    left.set(given.soldLineId, subtractCharges(charges, chargesGivenBack(given)));
  }
}
