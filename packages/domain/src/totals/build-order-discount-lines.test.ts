import { describe, expect, it } from "vitest";
import { type BasisPoints, basisPoints, quantity, vnd } from "../money";
import type { OrderLine } from "../order";
import { codeOf } from "../order/order-line-test-fixtures";
import { type OrderDiscount, buildOrderDiscountLines } from "./build-order-discount-lines";
import { computeOrderTotals } from "./compute-order-totals";
import { TOTALS_ERROR_CODES as C } from "./totals-error-codes";
import {
  TAX_EXCLUSIVE,
  VAT_0,
  VAT_10,
  VAT_8,
  discountLine,
  itemLine,
  modifierLine,
  orderOf,
} from "./totals-test-helpers";

const percent = (bp: number): OrderDiscount => ({ kind: "percent", rate: basisPoints(bp) });
const fixed = (amount: number): OrderDiscount => ({ kind: "fixed", amount: vnd(amount) });

function counter() {
  let n = 0;
  return () => `d${++n}`;
}

const build = (lines: OrderLine[], discount: OrderDiscount) =>
  buildOrderDiscountLines(orderOf(lines), discount, counter());
const split = (built: OrderLine[]) =>
  built.map((l): [string, BasisPoints, bigint] => [l.id, l.taxRate, -l.unitPrice]);

// 104.000 of drinks at 8%, 65.000 of food at 10%.
const teaAndBurger = [
  itemLine("tea", 45_000, VAT_8, quantity(2)),
  modifierLine("pearl", "tea", 7_000, VAT_8),
  itemLine("burger", 65_000, VAT_10),
];

describe("buildOrderDiscountLines", () => {
  it("builds one root discount line per tax rate, in rate order, in proportion to each base", () => {
    const built = build(teaAndBurger, percent(1_000));
    expect(split(built)).toEqual([
      ["d1", VAT_8, 10_400n],
      ["d2", VAT_10, 6_500n],
    ]);
    expect(built[0]).toMatchObject({
      parentLineId: null,
      lineType: "discount",
      quantity: quantity(1),
      unitPrice: vnd(-10_400),
    });
  });

  it("takes the percent of the whole base once, so the lines add up to it to the đồng", () => {
    const lines = [itemLine("a", 15, VAT_0), itemLine("b", 15, VAT_8), itemLine("c", 15, VAT_10)];
    // 10% of 45 = 4,5 → 5; 10% of each 15 rounded separately would give 3 × 2 = 6
    expect(split(build(lines, percent(1_000)))).toEqual([
      ["d1", VAT_0, 2n],
      ["d2", VAT_8, 2n],
      ["d3", VAT_10, 1n],
    ]);
  });

  it("splits a fixed amount exactly, on what is left after the line discounts", () => {
    const lines = [...teaAndBurger, discountLine("burger-off", "burger", 5_000, VAT_10)];
    // 50.000 over 104.000 : 60.000 = 31.707,3 and 18.292,7
    expect(split(build(lines, fixed(50_000)))).toEqual([
      ["d1", VAT_8, 31_707n],
      ["d2", VAT_10, 18_293n],
    ]);
  });

  it("produces lines that computeOrderTotals takes off to the đồng", () => {
    const lines = [...teaAndBurger, discountLine("burger-off", "burger", 5_000, VAT_10)];
    const before = computeOrderTotals(orderOf(lines), TAX_EXCLUSIVE);
    const built = build(lines, percent(1_000));
    expect(split(built)).toEqual([
      ["d1", VAT_8, 10_400n],
      ["d2", VAT_10, 6_000n],
    ]);
    const after = computeOrderTotals(orderOf([...lines, ...built]), TAX_EXCLUSIVE);
    expect(after.discountTotal - before.discountTotal).toBe(16_400n);
  });

  it("asks for an id only for the lines it builds, skipping a rate with nothing to discount", () => {
    const ids: string[] = [];
    const next = () => {
      ids.push(`id${ids.length}`);
      return ids[ids.length - 1] ?? "";
    };
    const lines = [itemLine("tea", 30_000, VAT_8), itemLine("water", 0, VAT_10)];
    const built = buildOrderDiscountLines(orderOf(lines), percent(1_000), next);
    expect(split(built)).toEqual([["id0", VAT_8, 3_000n]]);
    expect(ids).toEqual(["id0"]);
  });

  it("returns no line when the order has nothing to discount", () => {
    expect(build([], percent(1_000))).toEqual([]);
  });

  it("allows 100% or the whole base as a fixed amount, and nothing is left to pay", () => {
    for (const discount of [percent(10_000), fixed(169_000)]) {
      const lines = [...teaAndBurger, ...build(teaAndBurger, discount)];
      expect(computeOrderTotals(orderOf(lines), TAX_EXCLUSIVE).amountDue).toBe(vnd(0));
    }
  });

  it("refuses a fixed amount above what is still due instead of cutting it down", () => {
    expect(codeOf(() => build(teaAndBurger, fixed(169_001)))).toBe(C.discountExceedsBase);
    const fullyDiscounted = [...teaAndBurger, ...build(teaAndBurger, percent(10_000))];
    expect(codeOf(() => build(fullyDiscounted, fixed(1)))).toBe(C.discountExceedsBase);
    expect(codeOf(() => build([], fixed(1)))).toBe(C.discountExceedsBase);
  });

  it("refuses a discount that takes off nothing", () => {
    expect(codeOf(() => build(teaAndBurger, percent(0)))).toBe(C.nonPositiveDiscount);
    expect(codeOf(() => build(teaAndBurger, fixed(0)))).toBe(C.nonPositiveDiscount);
    expect(codeOf(() => build(teaAndBurger, fixed(-1)))).toBe(C.nonPositiveDiscount);
  });
});
