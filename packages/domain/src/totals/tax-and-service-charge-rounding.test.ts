import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { basisPoints, vnd } from "../money";
import { computeOrderTotals } from "./compute-order-totals";
import { generatedOrder } from "./order-totals-arbitraries";
import {
  TAX_EXCLUSIVE,
  TAX_INCLUSIVE,
  VAT_0,
  VAT_8,
  itemLine,
  orderOf,
  withServiceCharge,
} from "./totals-test-helpers";

const VAT_5 = basisPoints(500);

/** Nearest đồng, half away from zero, written out here instead of borrowed from the domain. */
const halfUp = (numerator: bigint, denominator: bigint) =>
  (2n * numerator + denominator) / (2n * denominator);

describe("tax and service charge round half up, worked by hand", () => {
  it.each([
    // 8% on top of 10.007 = 800,56 → 801
    [10_007, VAT_8, 801n],
    // 5% on top of 10.010 = 500,5 → 501: a tie goes up, not down and not to the even 500
    [10_010, VAT_5, 501n],
    // 8% on top of 10.012 = 800,96 → 801
    [10_012, VAT_8, 801n],
  ])("VAT added on top of %d at %d bp is %d", (price, rate, tax) => {
    const t = computeOrderTotals(orderOf([itemLine("a", price, rate)]), TAX_EXCLUSIVE);
    expect(t.taxTotal).toBe(vnd(tax));
    expect(t.amountDue).toBe(vnd(BigInt(price) + tax));
  });

  it("carves VAT out of a tax-inclusive 10.013 at 8%: 10.013 × 8 / 108 = 741,70 → 742", () => {
    const t = computeOrderTotals(orderOf([itemLine("a", 10_013, VAT_8)]), TAX_INCLUSIVE);
    expect([t.taxTotal, t.taxBreakdown[0]?.base, t.amountDue]).toEqual([742n, 9_271n, 10_013n]);
  });

  it("charges 5% service on 10.010 as 501, and its 10% VAT on 501 as 50", () => {
    const profile = withServiceCharge(TAX_EXCLUSIVE); // 5% on dine-in, taxed at 10%
    const t = computeOrderTotals(orderOf([itemLine("a", 10_010, VAT_0)]), profile);
    expect([t.serviceCharge, t.serviceChargeTax, t.taxTotal, t.amountDue]).toEqual(
      [501n, 50n, 50n, 10_561n].map(vnd),
    );
  });

  it("charges 5% service on 10.030 as 502 (501,5 goes up)", () => {
    const profile = withServiceCharge(TAX_INCLUSIVE, { taxRate: VAT_0 });
    const t = computeOrderTotals(orderOf([itemLine("a", 10_030, VAT_0)]), profile);
    expect(t.serviceCharge).toBe(vnd(502n));
  });
});

describe("on random orders, every rounded amount matches the formula written out", () => {
  it("each tax group's tax and the service charge", () => {
    fc.assert(
      fc.property(generatedOrder, ({ order, profile }) => {
        const t = computeOrderTotals(order, profile);
        for (const { rate, base, tax } of t.taxBreakdown) {
          const r = BigInt(rate);
          const expected = profile.pricesIncludeTax
            ? halfUp((base + tax) * r, 10_000n + r)
            : halfUp(base * r, 10_000n);
          expect(tax).toBe(expected);
        }
        const rule = profile.serviceCharge;
        const applies = rule !== null && rule.appliesTo.includes(order.serviceType);
        const base = rule?.base === "before_discount" ? t.grossTotal : t.netTotal;
        const expected = applies ? halfUp(base * BigInt(rule.rate), 10_000n) : 0n;
        expect(t.serviceCharge).toBe(expected);
      }),
      { numRuns: 1_000 },
    );
  });
});
