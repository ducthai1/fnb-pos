import { DomainError } from "../errors";
import {
  type BasisPoints,
  type Vnd,
  ZERO_VND,
  addVnd,
  applyRate,
  negateVnd,
  quantity,
  subtractVnd,
} from "../money";
import type { Order, OrderLine } from "../order";
import { allocateAmount } from "./allocate-amount";
import { goodsLineAmounts } from "./goods-line-amounts";
import { TOTALS_ERROR_CODES } from "./totals-error-codes";

export type OrderDiscount =
  | { readonly kind: "percent"; readonly rate: BasisPoints }
  | { readonly kind: "fixed"; readonly amount: Vnd };

/**
 * Turns a discount on the whole order into root discount lines, one per tax rate on the order,
 * because the invoice must show how much of the discount came off each rate's base. The amount
 * is worked out once on the whole base (10% of the bill, not 10% of each group rounded
 * separately) and split by allocateAmount, so the lines add up to it to the đồng.
 *
 * The base is what is still due on the goods: line discounts and earlier order discounts are
 * already taken off. A fixed amount above that base is refused rather than cut down: the cashier
 * or the promotion asked for that amount, and quietly giving less would print a receipt that
 * disagrees with what the customer was told. A rate whose share rounds to 0 đ gets no line.
 *
 * `ids` supplies one id per line (UUIDv7 from the caller; the domain does not generate ids).
 * The lines carry no display name and `manual` as price source; the caller sets both when the
 * discount comes from a named promotion.
 */
export function buildOrderDiscountLines(
  order: Pick<Order, "lines">,
  discount: OrderDiscount,
  ids: () => string,
): OrderLine[] {
  const netByRate = new Map<BasisPoints, Vnd>();
  for (const g of goodsLineAmounts(order.lines)) {
    const net = subtractVnd(g.gross, g.discount);
    netByRate.set(g.taxRate, addVnd(netByRate.get(g.taxRate) ?? ZERO_VND, net));
  }
  const groups = [...netByRate].sort(([a], [b]) => a - b);
  const base = addVnd(...groups.map(([, net]) => net));
  const total = discountTotal(discount, base);
  const weights = groups.map(([rate, net]) => ({ id: String(rate), weight: net }));
  return allocateAmount(total, weights).flatMap((share, i) => {
    const rate = groups[i]?.[0];
    if (rate === undefined || share.amount === 0n) return [];
    return [orderDiscountLine(ids(), rate, share.amount)];
  });
}

function discountTotal(discount: OrderDiscount, base: Vnd): Vnd {
  if (discount.kind === "percent") {
    if (discount.rate <= 0) refuseEmpty(discount);
    return applyRate(base, discount.rate, "half-up");
  }
  if (discount.amount <= 0n) refuseEmpty(discount);
  if (discount.amount > base) {
    throw new DomainError(
      TOTALS_ERROR_CODES.discountExceedsBase,
      `a ${discount.amount} discount exceeds the ${base} still due on the order`,
      { scope: null, discount: discount.amount, base },
    );
  }
  return discount.amount;
}

function refuseEmpty(discount: OrderDiscount): never {
  throw new DomainError(
    TOTALS_ERROR_CODES.nonPositiveDiscount,
    "an order discount must take off a positive amount",
    { ...discount },
  );
}

function orderDiscountLine(id: string, taxRate: BasisPoints, amount: Vnd): OrderLine {
  return {
    id,
    parentLineId: null,
    lineType: "discount",
    productId: null,
    variantId: null,
    modifierOptionId: null,
    nameSnapshot: "",
    unitPrice: negateVnd(amount),
    quantity: quantity(1),
    taxRate,
    note: null,
    priceSource: "manual",
    reversesLineId: null,
  };
}
