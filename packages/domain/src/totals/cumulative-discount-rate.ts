import { DomainError } from "../errors";
import {
  type BasisPoints,
  FULL_RATE,
  type Vnd,
  addVnd,
  basisPoints,
  divideRounded,
  subtractVnd,
} from "../money";
import { type Order, type OrderLine, subtreeOf } from "../order";
import { type GoodsLineAmount, goodsLineAmounts } from "./goods-line-amounts";
import { TOTALS_ERROR_CODES } from "./totals-error-codes";

/** A line discount reduces one sold item and its children; an order discount, the whole order. */
export type DiscountScope =
  { readonly kind: "line"; readonly lineId: string } | { readonly kind: "order" };

/**
 * The rate authorize() judges a discount by: everything the discounts of that kind already take
 * off the scope plus the ones about to be added, not the rate of the newest one alone. Judging
 * each discount on its own let a cashier capped at 10% give three 10% discounts on one tea and
 * take 30% off without anyone approving it. `proposedDiscountLines` are the lines the discount
 * would add (from buildLineDiscount or buildOrderDiscountLines); a line outside the scope is
 * refused, since counting it nowhere would let it through unjudged.
 */
export function projectedDiscountRate(
  order: Pick<Order, "lines">,
  proposedDiscountLines: readonly OrderLine[],
  scope: DiscountScope,
): BasisPoints {
  const parent = scope.kind === "line" ? scope.lineId : null;
  for (const line of proposedDiscountLines) {
    if (line.lineType === "discount" && line.parentLineId === parent) continue;
    throw new DomainError(
      TOTALS_ERROR_CODES.invalidDiscountScope,
      `line ${line.id} is not a discount on ${parent ?? "the order"}`,
      { lineId: line.id, lineType: line.lineType, parentLineId: line.parentLineId, scope: parent },
    );
  }
  const lines = { lines: [...order.lines, ...proposedDiscountLines] };
  return parent === null ? discountRateOfOrder(lines) : discountRateOfLine(lines, parent);
}

/**
 * The share of a sold item (with its toppings and picks, after voids) that line discounts take
 * off. Order discounts are not counted: they are judged by their own key, on the order.
 */
export function discountRateOfLine(order: Pick<Order, "lines">, lineId: string): BasisPoints {
  const subtree = subtreeOf(order.lines, lineId);
  const head = subtree.find((line) => line.id === lineId);
  if (head?.lineType !== "item" || head.reversesLineId !== null) {
    throw new DomainError(
      TOTALS_ERROR_CODES.invalidDiscountScope,
      `a line discount reduces a sold item, not ${head?.lineType ?? "a missing"} line ${lineId}`,
      { lineId },
    );
  }
  const ids = new Set(subtree.map((line) => line.id));
  const goods = lineDiscountAmounts(order.lines).filter((g) => ids.has(g.lineId));
  return rateOf(sum(goods, "discount"), sum(goods, "gross"));
}

/**
 * The share of the order that order discounts take off, measured on what is left after line
 * discounts: that is the base an order discount is worked out on (see buildOrderDiscountLines),
 * so a single 10% order discount reads as 10%.
 */
export function discountRateOfOrder(order: Pick<Order, "lines">): BasisPoints {
  const lineOnly = lineDiscountAmounts(order.lines);
  const all = goodsLineAmounts(order.lines);
  const lineDiscounts = sum(lineOnly, "discount");
  const orderDiscounts = subtractVnd(sum(all, "discount"), lineDiscounts);
  return rateOf(orderDiscounts, subtractVnd(sum(all, "gross"), lineDiscounts));
}

/** Line discounts are taken first, so pricing without the order discounts isolates them. */
function lineDiscountAmounts(lines: readonly OrderLine[]): GoodsLineAmount[] {
  return goodsLineAmounts(
    lines.filter((line) => line.lineType !== "discount" || line.parentLineId !== null),
  );
}

function sum(goods: readonly GoodsLineAmount[], field: "gross" | "discount"): Vnd {
  return addVnd(...goods.map((g) => g[field]));
}

/**
 * Rounded UP to the basis point, so a discount a fraction above a cap never reads as within it:
 * a cap is a promise that nobody alone gives more, and rounding to nearest would break it.
 */
function rateOf(discount: Vnd, base: Vnd): BasisPoints {
  if (discount <= 0n) return basisPoints(0);
  // goodsLineAmounts refuses a discount above what it reduces, so a positive one has a base
  if (base <= 0n) return basisPoints(FULL_RATE);
  const rate = divideRounded(discount * BigInt(FULL_RATE), base, "up");
  return basisPoints(Number(rate > BigInt(FULL_RATE) ? BigInt(FULL_RATE) : rate));
}
