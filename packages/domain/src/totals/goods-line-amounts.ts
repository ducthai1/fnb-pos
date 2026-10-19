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
import { linesNetOfVoids } from "./lines-net-of-voids";
import { TOTALS_ERROR_CODES } from "./totals-error-codes";

/** A goods line (item, modifier, combo component): what it costs and the discount it carries. */
export interface GoodsLineAmount {
  readonly lineId: string;
  readonly taxRate: BasisPoints;
  readonly gross: Vnd;
  /** Positive amount taken off `gross` by the discount lines that reach this line. */
  readonly discount: Vnd;
  /**
   * false for a void line and for a line none of whose units are left: it carries nothing and
   * joins no tax group, so the invoice of an order with a void lists the same rates as the
   * order rung up without the cancelled units.
   */
  readonly priced: boolean;
}

interface WorkingLine {
  lineId: string;
  /** The item at the root of this line's tree: a line discount reaches only that item's lines. */
  rootItemId: string;
  taxRate: BasisPoints;
  gross: Vnd;
  discount: Vnd;
  priced: boolean;
}

interface DiscountBucket {
  /** The item a line discount hangs under; null for a discount on the whole order. */
  readonly scope: string | null;
  readonly rate: BasisPoints;
  amount: Vnd;
}

/**
 * Prices every goods line at unit price × effective quantity, then spreads each discount over
 * the goods of ITS tax rate: a discount line carries the rate of the goods it reduces, and the
 * invoice taxes each rate on its base after discount, so a discount must never move base from
 * one rate to another. A discount under an item reduces only that item and its children, and
 * is taken first, so an order discount applies to what the customer still pays for each line.
 * Void lines are folded into the items they cancel first (see linesNetOfVoids); they are
 * listed, in place, at zero.
 */
export function goodsLineAmounts(lines: readonly OrderLine[]): GoodsLineAmount[] {
  validateLineTree(lines);
  const { priced, voidLineIds } = linesNetOfVoids(lines);
  const byId = new Map(priced.map((line) => [line.id, line]));
  const goods: WorkingLine[] = [];
  const buckets = new Map<string, DiscountBucket>();
  for (const line of priced) {
    const units = effectiveQuantity(priced, line.id);
    const amount = multiplyVndByQuantity(line.unitPrice, units, "half-up");
    if (line.lineType === "discount") {
      assertDiscountPrice(line);
      const key = `${line.parentLineId ?? ""}|${line.taxRate}`;
      const bucket = buckets.get(key) ?? {
        scope: line.parentLineId,
        rate: line.taxRate,
        amount: ZERO_VND,
      };
      bucket.amount = addVnd(bucket.amount, negateVnd(amount));
      buckets.set(key, bucket);
    } else {
      assertGoodsPrice(line);
      goods.push({
        lineId: line.id,
        rootItemId: rootItemId(byId, line),
        taxRate: line.taxRate,
        gross: amount,
        discount: ZERO_VND,
        priced: units !== 0n,
      });
    }
  }
  const all = [...buckets.values()];
  for (const bucket of [
    ...all.filter((b) => b.scope !== null),
    ...all.filter((b) => b.scope === null),
  ]) {
    const scope = goods.filter(
      (g) => g.taxRate === bucket.rate && (bucket.scope === null || g.rootItemId === bucket.scope),
    );
    spreadDiscount(bucket, scope);
  }
  const byLineId = new Map(goods.map((g) => [g.lineId, g]));
  return lines
    .filter((line) => line.lineType !== "discount")
    .map(({ id, taxRate }) => {
      const g = voidLineIds.has(id) ? undefined : byLineId.get(id);
      if (!g) return { lineId: id, taxRate, gross: ZERO_VND, discount: ZERO_VND, priced: false };
      return { lineId: id, taxRate, gross: g.gross, discount: g.discount, priced: g.priced };
    });
}

function spreadDiscount({ scope, rate, amount }: DiscountBucket, targets: WorkingLine[]): void {
  const weights = targets.map((g) => ({ id: g.lineId, weight: subtractVnd(g.gross, g.discount) }));
  const base = addVnd(...weights.map((w) => w.weight));
  // Taking more than the goods are worth would leave a negative net, i.e. pay the customer;
  // that is a refund, which is its own document, never a discount.
  if (amount > base) {
    throw new DomainError(
      TOTALS_ERROR_CODES.discountExceedsBase,
      `discount ${amount} at rate ${rate} on ${scope ?? "the order"} exceeds the ${base} it can reduce`,
      { scope, rate, discount: amount, base },
    );
  }
  allocateAmount(amount, weights).forEach((share, i) => {
    const target = targets[i];
    if (target) target.discount = addVnd(target.discount, share.amount);
  });
}

/** The tree was validated, so every parent exists and the walk ends at a root item. */
function rootItemId(byId: ReadonlyMap<string, OrderLine>, line: OrderLine): string {
  let current = line;
  for (let parent = parentOf(byId, current); parent; parent = parentOf(byId, current)) {
    current = parent;
  }
  return current.id;
}

function parentOf(byId: ReadonlyMap<string, OrderLine>, line: OrderLine): OrderLine | undefined {
  return line.parentLineId === null ? undefined : byId.get(line.parentLineId);
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
