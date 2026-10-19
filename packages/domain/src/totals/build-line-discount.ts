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
import { ORDER_ERROR_CODES, type Order, type OrderLine, subtreeOf } from "../order";
import { allocateAmount } from "./allocate-amount";
import { goodsLineAmounts } from "./goods-line-amounts";
import { TOTALS_ERROR_CODES } from "./totals-error-codes";

export type LineDiscount =
  | { readonly kind: "percent"; readonly rate: BasisPoints }
  | { readonly kind: "fixed_for_line"; readonly amount: Vnd };

/**
 * Turns a discount on one sold item (with its toppings and picks) into discount lines under it,
 * one per tax rate in that item, so the invoice can say which rate's base it came off. The amount
 * is worked out once on what is still due on the item after its earlier line discounts, then
 * split by allocateAmount, so the lines add up to it to the đồng.
 *
 * The lines are whole-line discounts (wholeParentLine): a discount per unit would have to be
 * the amount divided by the units, and 10.000 đ over three cups is no whole number of đồng, so
 * the line would come out at 9.999 or 10.002 whatever the caller did. A fixed amount above what
 * is due is refused rather than cut down, as for an order discount; a rate whose share rounds
 * to 0 đ gets no line. A partly voided item gets no new line discount, since the copy of it the
 * void made must keep matching it (see validateLineTree). Judge the result with
 * projectedDiscountRate before adding it.
 *
 * `ids` supplies one id per line; the lines carry no name and `manual` as price source, like
 * buildOrderDiscountLines, for the caller to set when a named promotion gives the discount.
 */
export function buildLineDiscount(
  order: Pick<Order, "lines">,
  lineId: string,
  discount: LineDiscount,
  ids: () => string,
): OrderLine[] {
  const item = soldItem(order.lines, lineId);
  const inLine = new Set(subtreeOf(order.lines, item.id).map((line) => line.id));
  // line discounts come before order discounts, so the base leaves the order discounts out
  const beforeOrderDiscounts = order.lines.filter(
    (line) => line.lineType !== "discount" || line.parentLineId !== null,
  );
  const netByRate = new Map<BasisPoints, Vnd>();
  for (const g of goodsLineAmounts(beforeOrderDiscounts)) {
    if (!inLine.has(g.lineId)) continue;
    const net = subtractVnd(g.gross, g.discount);
    netByRate.set(g.taxRate, addVnd(netByRate.get(g.taxRate) ?? ZERO_VND, net));
  }
  const groups = [...netByRate].sort(([a], [b]) => a - b);
  const base = addVnd(...groups.map(([, net]) => net));
  const total = discountTotal(discount, base, lineId);
  const weights = groups.map(([rate, net]) => ({ id: String(rate), weight: net }));
  const lines = allocateAmount(total, weights).flatMap((share, i) => {
    const rate = groups[i]?.[0];
    if (rate === undefined || share.amount === 0n) return [];
    return [wholeLineDiscount(ids(), lineId, rate, share.amount)];
  });
  // an order discount already given may no longer fit what is left; let the totals say so
  goodsLineAmounts([...order.lines, ...lines]);
  return lines;
}

function soldItem(lines: readonly OrderLine[], lineId: string): OrderLine {
  const item = lines.find((line) => line.id === lineId);
  if (!item) {
    throw new DomainError(ORDER_ERROR_CODES.lineNotFound, `no order line ${lineId}`, { lineId });
  }
  if (item.lineType !== "item" || item.reversesLineId !== null) {
    throw new DomainError(
      TOTALS_ERROR_CODES.invalidDiscountScope,
      `a line discount reduces a sold item, not ${item.lineType} line ${lineId}`,
      { lineId },
    );
  }
  if (lines.some((line) => line.reversesLineId === lineId)) {
    throw new DomainError(
      TOTALS_ERROR_CODES.discountOnPartlyVoidedLine,
      `line ${lineId} is partly voided; its void copy would no longer match it`,
      { lineId },
    );
  }
  return item;
}

function discountTotal(discount: LineDiscount, base: Vnd, lineId: string): Vnd {
  const refuseEmpty = (): never => {
    throw new DomainError(
      TOTALS_ERROR_CODES.nonPositiveDiscount,
      "a line discount must take off a positive amount",
      { lineId, ...discount },
    );
  };
  if (discount.kind === "percent") {
    if (discount.rate <= 0) refuseEmpty();
    return applyRate(base, discount.rate, "half-up");
  }
  if (discount.amount <= 0n) refuseEmpty();
  if (discount.amount > base) {
    throw new DomainError(
      TOTALS_ERROR_CODES.discountExceedsBase,
      `a ${discount.amount} discount exceeds the ${base} still due on line ${lineId}`,
      { scope: lineId, discount: discount.amount, base },
    );
  }
  return discount.amount;
}

function wholeLineDiscount(id: string, itemId: string, taxRate: BasisPoints, amount: Vnd) {
  const line: OrderLine = {
    id,
    parentLineId: itemId,
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
    wholeParentLine: true,
  };
  return line;
}
