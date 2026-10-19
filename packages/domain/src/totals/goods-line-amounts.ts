import { DomainError } from "../errors";
import {
  type BasisPoints,
  type Vnd,
  ZERO_VND,
  addVnd,
  multiplyVndByQuantity,
  negateVnd,
  subtractVnd,
} from "../money";
import { type OrderLine, effectiveQuantity, validateLineTree } from "../order";
import { allocateAmount } from "./allocate-amount";
import { TOTALS_ERROR_CODES } from "./totals-error-codes";

/** A goods line (item, modifier, combo component): what it costs and the discount it carries. */
export interface GoodsLineAmount {
  readonly lineId: string;
  readonly taxRate: BasisPoints;
  readonly gross: Vnd;
  /** Positive amount taken off `gross` by the discount lines that reach this line. */
  readonly discount: Vnd;
}

interface WorkingLine {
  lineId: string;
  taxRate: BasisPoints;
  gross: Vnd;
  discount: Vnd;
}

/**
 * Prices every goods line at unit price × effective quantity, then spreads each discount over
 * the goods of ITS tax rate: a discount line carries the rate of the goods it reduces, and the
 * invoice taxes each rate on its base after discount, so a discount must never move base from
 * one rate to another.
 */
export function goodsLineAmounts(lines: readonly OrderLine[]): GoodsLineAmount[] {
  validateLineTree(lines);
  const goods: WorkingLine[] = [];
  const discountByRate = new Map<BasisPoints, Vnd>();
  for (const line of lines) {
    const amount = multiplyVndByQuantity(
      line.unitPrice,
      effectiveQuantity(lines, line.id),
      "half-up",
    );
    if (line.lineType === "discount") {
      assertDiscountPrice(line);
      const sofar = discountByRate.get(line.taxRate) ?? ZERO_VND;
      discountByRate.set(line.taxRate, addVnd(sofar, negateVnd(amount)));
    } else {
      assertGoodsPrice(line);
      goods.push({ lineId: line.id, taxRate: line.taxRate, gross: amount, discount: ZERO_VND });
    }
  }
  for (const [rate, discount] of discountByRate) {
    spreadDiscount(
      discount,
      rate,
      goods.filter((g) => g.taxRate === rate),
    );
  }
  return goods.map((g) => ({ ...g }));
}

function spreadDiscount(discount: Vnd, rate: BasisPoints, scope: WorkingLine[]): void {
  const weights = scope.map((g) => ({ id: g.lineId, weight: subtractVnd(g.gross, g.discount) }));
  const base = addVnd(...weights.map((w) => w.weight));
  // Taking more than the goods are worth would leave a negative net, i.e. pay the customer;
  // that is a refund, which is its own document, never a discount.
  if (discount > base) {
    throw new DomainError(
      TOTALS_ERROR_CODES.discountExceedsBase,
      `discount ${discount} at rate ${rate} exceeds the ${base} it can reduce`,
      { rate, discount, base },
    );
  }
  allocateAmount(discount, weights).forEach(({ amount }, i) => {
    const target = scope[i];
    if (target) target.discount = addVnd(target.discount, amount);
  });
}

function assertGoodsPrice(line: OrderLine): void {
  // Catalog and pricing never produce a negative price; a reduction is a discount line.
  if (line.unitPrice < 0n) {
    throw new DomainError(
      TOTALS_ERROR_CODES.negativeGoodsPrice,
      `${line.lineType} line ${line.id} has a negative price: ${line.unitPrice}`,
      { lineId: line.id, unitPrice: line.unitPrice },
    );
  }
}

function assertDiscountPrice(line: OrderLine): void {
  // A positive "discount" would be a surcharge hidden from the tax and service-charge rules.
  if (line.unitPrice > 0n) {
    throw new DomainError(
      TOTALS_ERROR_CODES.positiveDiscountPrice,
      `discount line ${line.id} must have a negative price: ${line.unitPrice}`,
      { lineId: line.id, unitPrice: line.unitPrice },
    );
  }
}
