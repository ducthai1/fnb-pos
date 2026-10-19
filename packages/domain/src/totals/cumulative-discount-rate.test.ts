import { describe, expect, it } from "vitest";
import { percentRate, quantity } from "../money";
import { ORDER_ERROR_CODES, type OrderLine } from "../order";
import { codeOf, order, reversal, sequentialIds } from "../order/order-line-test-fixtures";
import { buildOrderDiscountLines } from "./build-order-discount-lines";
import {
  discountRateOfLine,
  discountRateOfOrder,
  projectedDiscountRate,
} from "./cumulative-discount-rate";
import { TOTALS_ERROR_CODES } from "./totals-error-codes";
import { VAT_8, discountLine, itemLine, modifierLine } from "./totals-test-helpers";
import { voidUnits } from "./totals-void-test-helpers";

const tea = itemLine("tea", 100_000, VAT_8);
const off = (id: string, amount: number, parent: string | null = "tea") =>
  discountLine(id, parent, amount, VAT_8);
const lineRate = (lines: OrderLine[], id = "tea") => discountRateOfLine(order(lines), id);

describe("discountRateOfLine adds up every line discount on the item", () => {
  it("reads three 10.000 đ discounts on a 100.000 đ tea as 10%, 20%, 30%", () => {
    const steps = [off("d1", 10_000), off("d2", 10_000), off("d3", 10_000)];
    const rates = steps.map((_, k) => lineRate([tea, ...steps.slice(0, k + 1)]));
    expect(rates).toEqual([1_000, 2_000, 3_000]);
  });

  it("rounds up, so a đồng above a cap never reads as within it", () => {
    expect(lineRate([tea, off("d", 10_001)])).toBe(1_001);
    expect(lineRate([itemLine("tea", 30_000, VAT_8), off("d", 1)])).toBe(1);
    expect(lineRate([tea, off("d", 10_000)])).toBe(1_000);
  });

  it("measures the item with its toppings, over every unit, and after a void", () => {
    const pearl = modifierLine("pearl", "tea", 20_000, VAT_8);
    expect(lineRate([tea, pearl, off("d", 12_000)])).toBe(1_000);
    const three = [itemLine("tea", 33_000, VAT_8, quantity(3)), off("d", 3_300)];
    expect(lineRate(three)).toBe(1_000); // 3.300 per cup on 3 cups: 9.900 of 99.000
    const voided = voidUnits(order(three), "tea", quantity(1), quantity(3), sequentialIds("v"));
    expect(discountRateOfLine(voided, "tea")).toBe(1_000);
  });

  it("does not count an order discount, which is judged on the order", () => {
    const lines = [tea, off("d", 10_000), off("o", 9_000, null)];
    expect(lineRate(lines)).toBe(1_000);
  });

  it("reads 0 on a free item without a discount", () => {
    expect(lineRate([itemLine("tea", 0, VAT_8)])).toBe(0);
  });

  it.each<[string, OrderLine[], string, string]>([
    [
      "a topping",
      [tea, modifierLine("pearl", "tea", 1, VAT_8)],
      "pearl",
      TOTALS_ERROR_CODES.invalidDiscountScope,
    ],
    [
      "a cancel line",
      [itemLine("tea", 1, VAT_8, quantity(2)), reversal("r", "tea", quantity(-1))],
      "r",
      TOTALS_ERROR_CODES.invalidDiscountScope,
    ],
    ["a line not on the order", [tea], "ghost", ORDER_ERROR_CODES.lineNotFound],
  ])("refuses to measure %s as a line", (_, lines, id, code) => {
    expect(codeOf(() => lineRate(lines, id))).toBe(code);
  });
});

describe("discountRateOfOrder adds up every order discount, on what line discounts leave", () => {
  it("reads 10% then 19% for two 10% order discounts after a line discount", () => {
    const lines = [tea, off("d", 10_000)];
    const tenPercent = { kind: "percent", rate: percentRate(10) } as const;
    const first = buildOrderDiscountLines(order(lines), tenPercent, sequentialIds("o"));
    expect(discountRateOfOrder(order([...lines, ...first]))).toBe(1_000); // 9.000 of 90.000
    const second = buildOrderDiscountLines(
      order([...lines, ...first]),
      tenPercent,
      sequentialIds("p"),
    );
    expect(discountRateOfOrder(order([...lines, ...first, ...second]))).toBe(1_900); // 17.100
  });
});

describe("projectedDiscountRate", () => {
  it("is the rate once the proposed lines are added", () => {
    const base = order([tea, off("d1", 10_000)]);
    expect(projectedDiscountRate(base, [off("d2", 5_000)], { kind: "line", lineId: "tea" })).toBe(
      1_500,
    );
    expect(projectedDiscountRate(base, [off("o", 9_000, null)], { kind: "order" })).toBe(1_000);
    expect(projectedDiscountRate(base, [], { kind: "line", lineId: "tea" })).toBe(1_000);
  });

  it.each<[string, OrderLine, "line" | "order"]>([
    ["an order discount passed off as a line discount", off("o", 1, null), "line"],
    ["a line discount passed off as an order discount", off("d", 1), "order"],
    ["a discount on another item", off("d", 1, "coffee"), "line"],
    ["a sale line", itemLine("cake", 1, VAT_8), "order"],
  ])("refuses %s, which would otherwise go unjudged", (_, proposed, kind) => {
    const base = order([tea, itemLine("coffee", 1, VAT_8)]);
    const scope = kind === "line" ? ({ kind, lineId: "tea" } as const) : ({ kind } as const);
    expect(codeOf(() => projectedDiscountRate(base, [proposed], scope))).toBe(
      TOTALS_ERROR_CODES.invalidDiscountScope,
    );
  });
});
