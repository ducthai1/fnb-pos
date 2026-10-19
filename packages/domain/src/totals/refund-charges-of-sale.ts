import {
  type Quantity,
  type Vnd,
  ZERO_VND,
  addVnd,
  divideRounded,
  negateVnd,
  subtractVnd,
  vnd,
} from "../money";
import type { Order, RefundLineAmounts } from "../order";
import { allocateAmount } from "./allocate-amount";
import { computeOrderTotals } from "./compute-order-totals";
import type { OrderChargeProfile } from "./order-totals-types";

/** What a sold goods line was charged, by part, as positive amounts; `net` is after discount. */
export interface LineCharges {
  readonly net: Vnd;
  readonly discount: Vnd;
  readonly tax: Vnd;
  readonly serviceCharge: Vnd;
  readonly serviceChargeTax: Vnd;
}

/**
 * The sale's totals carried down to each of its goods lines. Discount and tax already are (the
 * line snapshot); the service charge is a rate of the goods' gross or net, so it is shared out
 * over that same base, and its tax over the shares. Every part then adds up, over the lines, to
 * the sale's own figure, which is what lets refunds of every line give back exactly the sale.
 */
export function chargesBySoldLine(
  paidOrder: Order,
  profile: OrderChargeProfile,
): Map<string, LineCharges> {
  const sale = computeOrderTotals(paidOrder, profile);
  const beforeDiscount = profile.serviceCharge?.base === "before_discount";
  const serviceCharge = allocateAmount(
    sale.serviceCharge,
    sale.lines.map((l) => ({ id: l.lineId, weight: beforeDiscount ? l.gross : l.net })),
  );
  const serviceChargeTax = allocateAmount(
    sale.serviceChargeTax,
    serviceCharge.map(({ id, amount }) => ({ id, weight: amount })),
  );
  return new Map(
    sale.lines.map((l, i) => [
      l.lineId,
      {
        net: l.net,
        discount: l.discountAllocated,
        tax: l.tax,
        serviceCharge: serviceCharge[i]?.amount ?? ZERO_VND,
        serviceChargeTax: serviceChargeTax[i]?.amount ?? ZERO_VND,
      },
    ]),
  );
}

/** The charges an earlier refund line gave back, as positive amounts. */
export function chargesGivenBack(amounts: RefundLineAmounts): LineCharges {
  return {
    net: negateVnd(subtractVnd(amounts.gross, amounts.discountAllocated)),
    discount: negateVnd(amounts.discountAllocated),
    tax: negateVnd(amounts.tax),
    serviceCharge: negateVnd(amounts.serviceCharge),
    serviceChargeTax: negateVnd(amounts.serviceChargeTax),
  };
}

export function subtractCharges(a: LineCharges, b: LineCharges): LineCharges {
  return {
    net: subtractVnd(a.net, b.net),
    discount: subtractVnd(a.discount, b.discount),
    tax: subtractVnd(a.tax, b.tax),
    serviceCharge: subtractVnd(a.serviceCharge, b.serviceCharge),
    serviceChargeTax: subtractVnd(a.serviceChargeTax, b.serviceChargeTax),
  };
}

/**
 * The part of what is left that `units` of the `unitsLeft` still unrefunded carry. Each part is
 * rounded down, so no refund gives back more than the customer paid for what has been refunded
 * so far, and the refund of the last units takes everything left, so the refunds of a line add
 * up to exactly what it was charged however they were split. (allocateAmount would hand the
 * leftover đồng to the larger remainder, which may be the units refunded now.)
 */
export function shareOfCharges(
  left: LineCharges,
  units: Quantity,
  unitsLeft: Quantity,
): LineCharges {
  const part = (amount: Vnd): Vnd => vnd(divideRounded(amount * units, unitsLeft, "down"));
  return {
    net: part(left.net),
    discount: part(left.discount),
    tax: part(left.tax),
    serviceCharge: part(left.serviceCharge),
    serviceChargeTax: part(left.serviceChargeTax),
  };
}

/** A refund line's stored amounts for the charges it gives back: negative, as on the refund. */
export function refundLineAmounts(
  lineId: string,
  soldLineId: string,
  share: LineCharges,
): RefundLineAmounts {
  return {
    lineId,
    soldLineId,
    gross: negateVnd(addVnd(share.net, share.discount)),
    discountAllocated: negateVnd(share.discount),
    tax: negateVnd(share.tax),
    serviceCharge: negateVnd(share.serviceCharge),
    serviceChargeTax: negateVnd(share.serviceChargeTax),
  };
}
