import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { basisPoints, quantity, quantityFromThousandths, vnd } from "../money";
import type { OrderLine } from "../order";
import { order, sequentialIds } from "../order/order-line-test-fixtures";
import { type LineDiscount, buildLineDiscount } from "./build-line-discount";
import { computeOrderTotals } from "./compute-order-totals";
import { projectedDiscountRate } from "./cumulative-discount-rate";
import {
  TAX_EXCLUSIVE,
  VAT_0,
  VAT_10,
  VAT_8,
  itemLine,
  modifierLine,
  orderOf,
} from "./totals-test-helpers";

const RATES = [VAT_0, VAT_8, VAT_10];

/** An item of any quantity, weighed ones included, with toppings at any of three rates. */
const toppedItem = fc
  .record({
    price: fc.integer({ min: 0, max: 200_000 }),
    qty: fc.oneof(
      fc.integer({ min: 1, max: 9 }).map((n) => quantity(n)),
      fc.bigInt({ min: 1n, max: 9_999n }).map(quantityFromThousandths),
    ),
    rate: fc.nat(),
    toppings: fc.array(fc.record({ price: fc.integer({ min: 0, max: 30_000 }), rate: fc.nat() }), {
      maxLength: 3,
    }),
  })
  .map(({ price, qty, rate, toppings }): OrderLine[] => [
    itemLine("i", price, RATES[rate % 3] ?? VAT_0, qty),
    ...toppings.map((t, k) => modifierLine(`i-m${k}`, "i", t.price, RATES[t.rate % 3] ?? VAT_0)),
  ]);

const totalsOf = (lines: readonly OrderLine[]) => computeOrderTotals(orderOf(lines), TAX_EXCLUSIVE);
const halfUp = (n: bigint, d: bigint) => (2n * n + d) / (2n * d);
const ceil = (n: bigint, d: bigint) => (n + d - 1n) / d;

describe("buildLineDiscount on random lines", () => {
  it("takes off exactly the amount or the percent of the line, to the đồng, at any quantity", () => {
    fc.assert(
      fc.property(
        toppedItem,
        fc.nat(),
        fc.integer({ min: 1, max: 10_000 }),
        fc.boolean(),
        (lines, pick, rate, isPercent) => {
          const gross = totalsOf(lines).grossTotal;
          if (gross === 0n) return;
          const amount = 1n + (BigInt(pick) % gross);
          const discount: LineDiscount = isPercent
            ? { kind: "percent", rate: basisPoints(rate) }
            : { kind: "fixed_for_line", amount: vnd(amount) };
          const expected = isPercent ? halfUp(gross * BigInt(rate), 10_000n) : amount;
          const built = buildLineDiscount(order(lines), "i", discount, sequentialIds());
          expect(totalsOf([...lines, ...built]).discountTotal).toBe(expected);
          expect(built.every((l) => l.wholeParentLine === true && l.parentLineId === "i")).toBe(
            true,
          );
          // and it is judged at what it really takes off, rounded up
          const judged = projectedDiscountRate(order(lines), built, { kind: "line", lineId: "i" });
          expect(BigInt(judged)).toBe(ceil(expected * 10_000n, gross));
        },
      ),
      { numRuns: 1_000 },
    );
  });
});
