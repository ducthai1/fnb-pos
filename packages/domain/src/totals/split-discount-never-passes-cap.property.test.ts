import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isDomainError } from "../errors";
import { basisPoints, quantity, quantityFromThousandths, vnd } from "../money";
import type { OrderLine } from "../order";
import { order, sequentialIds } from "../order/order-line-test-fixtures";
import { authorize } from "../permissions";
import { rateGrant } from "../permissions/permissions-test-helpers";
import { type LineDiscount, buildLineDiscount } from "./build-line-discount";
import { type OrderDiscount, buildOrderDiscountLines } from "./build-order-discount-lines";
import { computeOrderTotals } from "./compute-order-totals";
import { type DiscountScope, projectedDiscountRate } from "./cumulative-discount-rate";
import { TOTALS_ERROR_CODES } from "./totals-error-codes";
import {
  TAX_INCLUSIVE,
  VAT_0,
  VAT_10,
  VAT_8,
  discountLine,
  itemLine,
  modifierLine,
} from "./totals-test-helpers";

const RUNS = { numRuns: 1_000 };
const RATES = [VAT_0, VAT_8, VAT_10];

const qty = fc.oneof(
  fc.integer({ min: 1, max: 5 }).map((n) => quantity(n)),
  fc.bigInt({ min: 1n, max: 5_000n }).map(quantityFromThousandths),
);
const cap = fc.integer({ min: 0, max: 10_000 });

/** One item with toppings, all at 8%, so a discount under it reaches all of it. */
const toppedItem = fc
  .record({
    price: fc.integer({ min: 1, max: 200_000 }),
    qty,
    toppings: fc.array(fc.integer({ min: 0, max: 30_000 }), { maxLength: 2 }),
  })
  .map(({ price, qty: q, toppings }) => [
    itemLine("i", price, VAT_8, q),
    ...toppings.map((p, k) => modifierLine(`i-m${k}`, "i", p, VAT_8)),
  ]);

/** Several items over several rates, one of them already carrying a line discount. */
const mixedOrder = fc
  .array(fc.record({ price: fc.integer({ min: 1, max: 200_000 }), qty, rate: fc.nat() }), {
    minLength: 1,
    maxLength: 4,
  })
  .map((items) => [
    ...items.map((it, k) => itemLine(`i${k}`, it.price, RATES[it.rate % 3] ?? VAT_0, it.qty)),
    discountLine("i0-d", "i0", 1, RATES[(items[0]?.rate ?? 0) % 3] ?? VAT_0),
  ]);

const orderStep: fc.Arbitrary<OrderDiscount> = fc.oneof(
  fc
    .integer({ min: 1, max: 10_000 })
    .map((r) => ({ kind: "percent", rate: basisPoints(r) }) as const),
  fc.integer({ min: 1, max: 300_000 }).map((a) => ({ kind: "fixed", amount: vnd(a) }) as const),
);

type Step = (lines: OrderLine[], k: number) => OrderLine[];
const onTheItem =
  (discount: LineDiscount): Step =>
  (lines, k) =>
    buildLineDiscount(order(lines), "i", discount, sequentialIds(`d${k}`));
const lineStep: fc.Arbitrary<Step> = fc.oneof(
  fc
    .integer({ min: 1, max: 50_000 })
    .map((a): Step => (_, k) => [discountLine(`d${k}`, "i", a, VAT_8)]),
  fc
    .integer({ min: 1, max: 300_000 })
    .map((a) => onTheItem({ kind: "fixed_for_line", amount: vnd(a) })),
  fc
    .integer({ min: 1, max: 10_000 })
    .map((r) => onTheItem({ kind: "percent", rate: basisPoints(r) })),
);

/** Exactly what the discounts of the scope's kind take off and the base, from the bill itself. */
function exactShare(lines: readonly OrderLine[], scope: DiscountScope) {
  const totalsOf = (ls: readonly OrderLine[]) => computeOrderTotals(order(ls), TAX_INCLUSIVE);
  const lineOnly = totalsOf(
    lines.filter((l) => l.lineType !== "discount" || l.parentLineId !== null),
  );
  if (scope.kind === "line") return { taken: lineOnly.discountTotal, base: lineOnly.grossTotal };
  const all = totalsOf(lines);
  return { taken: all.discountTotal - lineOnly.discountTotal, base: lineOnly.netTotal };
}

/**
 * Asks for each step in turn as a holder of `limit`; a step that needs approval is not given.
 * Each answer must be "allowed" exactly when the discount, everything before it included, is
 * within the cap; so no way of cutting a discount into pieces gets past the cap unapproved.
 */
function giveInSteps(
  start: OrderLine[],
  scope: DiscountScope,
  limit: number,
  steps: readonly Step[],
): OrderLine[] {
  const key = scope.kind === "line" ? "line_discount" : "order_discount";
  let lines = start;
  steps.forEach((proposalFor, k) => {
    let proposed: OrderLine[];
    let rate;
    try {
      proposed = proposalFor(lines, k);
      rate = projectedDiscountRate(order(lines), proposed, scope);
    } catch (error) {
      if (isDomainError(error, TOTALS_ERROR_CODES.discountExceedsBase)) return;
      throw error;
    }
    const result = authorize({ key, discountRate: rate }, [rateGrant(key, limit)]);
    const { taken, base } = exactShare([...lines, ...proposed], scope);
    expect(result === "allowed").toBe(taken * 10_000n <= BigInt(limit) * base);
    if (result === "allowed") lines = [...lines, ...proposed];
  });
  const { taken, base } = exactShare(lines, scope);
  expect(taken * 10_000n <= BigInt(limit) * base).toBe(true);
  return lines;
}

describe("splitting a discount into steps never gets it past the cap without approval", () => {
  it("on one item, however many line discounts it is cut into, per unit or whole-line", () => {
    fc.assert(
      fc.property(
        toppedItem,
        cap,
        fc.array(lineStep, { minLength: 1, maxLength: 8 }),
        (start, limit, steps) => {
          giveInSteps(start, { kind: "line", lineId: "i" }, limit, steps);
        },
      ),
      RUNS,
    );
  });

  it("on the order, however many order discounts it is cut into", () => {
    fc.assert(
      fc.property(
        mixedOrder,
        cap,
        fc.array(orderStep, { minLength: 1, maxLength: 6 }),
        (start, limit, asked) => {
          const steps = asked.map(
            (discount) => (lines: OrderLine[], k: number) =>
              buildOrderDiscountLines(order(lines), discount, sequentialIds(`o${k}`)),
          );
          giveInSteps(start, { kind: "order" }, limit, steps);
        },
      ),
      RUNS,
    );
  });
});
