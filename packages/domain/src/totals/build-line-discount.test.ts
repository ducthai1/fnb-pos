import { describe, expect, it } from "vitest";
import { percentRate, quantity, vnd } from "../money";
import { ORDER_ERROR_CODES, type OrderLine } from "../order";
import { codeOf, order, reversal, sequentialIds } from "../order/order-line-test-fixtures";
import { type LineDiscount, buildLineDiscount } from "./build-line-discount";
import { buildRefund } from "./build-refund";
import { computeOrderTotals } from "./compute-order-totals";
import { TOTALS_ERROR_CODES } from "./totals-error-codes";
import {
  TAX_INCLUSIVE,
  VAT_10,
  VAT_8,
  componentLine,
  discountLine,
  itemLine,
  modifierLine,
  orderOf,
} from "./totals-test-helpers";
import { paid, units } from "./totals-refund-test-helpers";

const fixed = (amount: number): LineDiscount => ({ kind: "fixed_for_line", amount: vnd(amount) });
const cups = [itemLine("tea", 33_000, VAT_8, quantity(3))];
const discounted = (lines: OrderLine[], discount: LineDiscount, id = "tea") => {
  const built = buildLineDiscount(order(lines), id, discount, sequentialIds("off"));
  return { built, totals: computeOrderTotals(orderOf([...lines, ...built]), TAX_INCLUSIVE) };
};

describe("buildLineDiscount takes off exactly what was given, whatever the units", () => {
  it("10.000 đ off a line of three cups is 10.000 đ, not 30.000 or 9.999", () => {
    const { built, totals } = discounted(cups, fixed(10_000));
    expect(built).toMatchObject([
      { parentLineId: "tea", unitPrice: -10_000n, quantity: 1000n, wholeParentLine: true },
    ]);
    expect([totals.discountTotal, totals.netTotal]).toEqual([10_000n, 89_000n]);
    // the per-cup line a caller would write by hand takes it off every cup
    const perCup = [...cups, discountLine("d", "tea", 10_000, VAT_8)];
    expect(computeOrderTotals(orderOf(perCup), TAX_INCLUSIVE).discountTotal).toBe(30_000n);
  });

  it("works a percent out once on the line: 10% of 3 × 33.333 = 9.999,9 → 10.000", () => {
    const lines = [itemLine("tea", 33_333, VAT_8, quantity(3))];
    expect(discounted(lines, { kind: "percent", rate: percentRate(10) }).totals.discountTotal).toBe(
      10_000n,
    );
  });

  it("is exact on a weighed item: 10.000 đ off 1,234 kg at 250.000 đ/kg", () => {
    const fish = [itemLine("tea", 250_000, VAT_8, quantity("1.234"))];
    expect(discounted(fish, fixed(10_000)).totals.discountTotal).toBe(10_000n);
  });

  it("splits by tax rate across a combo's picks, and the lines add up to the amount", () => {
    const combo = [
      itemLine("tea", 0, VAT_8, quantity(2)),
      componentLine("burger", "tea", 60_000, VAT_10),
      componentLine("coke", "tea", 15_000, VAT_8),
      modifierLine("cheese", "burger", 5_000, VAT_10),
    ];
    const { built, totals } = discounted(combo, fixed(10_001));
    // weights: 130.000 at 10%, 30.000 at 8%
    expect(built.map((l) => [l.taxRate, l.unitPrice])).toEqual([
      [VAT_8, -1_875n],
      [VAT_10, -8_126n],
    ]);
    expect(totals.discountTotal).toBe(10_001n);
  });

  it("works a percent out on what earlier line discounts left", () => {
    const lines = [itemLine("tea", 100_000, VAT_8), discountLine("d", "tea", 10_000, VAT_8)];
    const { totals } = discounted(lines, { kind: "percent", rate: percentRate(10) });
    expect(totals.discountTotal).toBe(19_000n);
  });

  it("gives no line for a percent that rounds to 0 đ", () => {
    const lines = [itemLine("tea", 4, VAT_8)];
    expect(discounted(lines, { kind: "percent", rate: percentRate(10) }).built).toEqual([]);
  });

  it("refunds a cup of a discounted line at its share of the discount, all three to the đồng", () => {
    const sale = paid(order([...cups, ...discounted(cups, fixed(10_000)).built]));
    let earlier: ReturnType<typeof buildRefund>["order"][] = [];
    for (const id of ["r1", "r2", "r3"]) {
      const ids = { orderId: id, newLineId: sequentialIds(id) };
      const refund = buildRefund(
        sale,
        [units("tea", 1)],
        earlier,
        ids,
        "2026-10-21",
        TAX_INCLUSIVE,
      );
      earlier = [...earlier, refund.order];
    }
    const given = earlier.map((r) => computeOrderTotals(r, TAX_INCLUSIVE).netTotal);
    expect(given.reduce((a, b) => a + b, 0n)).toBe(-89_000n);
  });
});

describe("buildLineDiscount refuses", () => {
  it.each<[string, OrderLine[], string, LineDiscount, string]>([
    ["a zero amount", cups, "tea", fixed(0), TOTALS_ERROR_CODES.nonPositiveDiscount],
    [
      "a zero percent",
      cups,
      "tea",
      { kind: "percent", rate: percentRate(0) },
      TOTALS_ERROR_CODES.nonPositiveDiscount,
    ],
    [
      "more than is due on the line",
      cups,
      "tea",
      fixed(99_001),
      TOTALS_ERROR_CODES.discountExceedsBase,
    ],
    ["a line not on the order", cups, "ghost", fixed(1), ORDER_ERROR_CODES.lineNotFound],
    [
      "a topping on its own",
      [...cups, modifierLine("pearl", "tea", 5_000, VAT_8)],
      "pearl",
      fixed(1),
      TOTALS_ERROR_CODES.invalidDiscountScope,
    ],
    [
      "a partly voided line, whose void copy must keep matching it",
      [...cups, reversal("r", "tea", quantity(-1))],
      "tea",
      fixed(1),
      TOTALS_ERROR_CODES.discountOnPartlyVoidedLine,
    ],
    [
      "a discount that leaves the order discount more than is due",
      [...cups, discountLine("o", null, 90_000, VAT_8)],
      "tea",
      fixed(10_000),
      TOTALS_ERROR_CODES.discountExceedsBase,
    ],
  ])("%s", (_, lines, id, discount, code) => {
    expect(codeOf(() => buildLineDiscount(order(lines), id, discount, sequentialIds()))).toBe(code);
  });
});
