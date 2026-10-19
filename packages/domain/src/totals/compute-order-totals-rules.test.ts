import { describe, expect, it } from "vitest";
import { vnd } from "../money";
import { ORDER_ERROR_CODES } from "../order";
import { codeOf } from "../order/order-line-test-fixtures";
import { computeOrderTotals } from "./compute-order-totals";
import { TOTALS_ERROR_CODES as C } from "./totals-error-codes";
import {
  TAX_EXCLUSIVE,
  VAT_10,
  VAT_8,
  discountLine,
  itemLine,
  modifierLine,
  orderOf,
} from "./totals-test-helpers";

const totalsOf = (...lines: Parameters<typeof orderOf>[0]) =>
  computeOrderTotals(orderOf(lines), TAX_EXCLUSIVE);

describe("computeOrderTotals refuses lines it cannot price", () => {
  it("accepts a 0 đ item but refuses a goods line with a negative price", () => {
    expect(totalsOf(itemLine("water", 0, VAT_8)).amountDue).toBe(vnd(0));
    expect(codeOf(() => totalsOf(itemLine("tea", -1, VAT_8)))).toBe(C.negativeGoodsPrice);
    const negativeTopping = [itemLine("tea", 30_000, VAT_8), modifierLine("m", "tea", -1, VAT_8)];
    expect(codeOf(() => totalsOf(...negativeTopping))).toBe(C.negativeGoodsPrice);
  });

  it("accepts a 0 đ discount but refuses a discount line with a positive price", () => {
    const tea = itemLine("tea", 30_000, VAT_8);
    expect(totalsOf(tea, discountLine("off", null, 0, VAT_8)).discountTotal).toBe(vnd(0));
    // a reduction of -1 đ is a discount line priced at +1 đ
    expect(codeOf(() => totalsOf(tea, discountLine("off", null, -1, VAT_8)))).toBe(
      C.positiveDiscountPrice,
    );
  });

  it("lets a discount take its rate group down to exactly zero, and not one đồng more", () => {
    const tea = itemLine("tea", 30_000, VAT_8);
    const allOff = totalsOf(tea, discountLine("off", null, 30_000, VAT_8));
    expect(allOff.netTotal).toBe(vnd(0));
    expect(allOff.taxTotal).toBe(vnd(0));
    expect(codeOf(() => totalsOf(tea, discountLine("off", null, 30_001, VAT_8)))).toBe(
      C.discountExceedsBase,
    );
  });

  it("does not let a discount borrow base from another tax rate", () => {
    // 40.000 of 10% goods are on the order, but only 30.000 at the discount's 8%
    const lines = [
      itemLine("tea", 30_000, VAT_8),
      itemLine("rice", 40_000, VAT_10),
      discountLine("off", null, 35_000, VAT_8),
    ];
    expect(codeOf(() => totalsOf(...lines))).toBe(C.discountExceedsBase);
  });

  it("refuses a discount at a rate no goods line on the order has", () => {
    const lines = [itemLine("tea", 30_000, VAT_8), discountLine("off", null, 1_000, VAT_10)];
    expect(codeOf(() => totalsOf(...lines))).toBe(C.discountExceedsBase);
  });

  it("refuses a corrupt line tree with the order's own error code", () => {
    const orphan = modifierLine("pearl", "missing-tea", 7_000, VAT_8);
    expect(codeOf(() => totalsOf(itemLine("tea", 30_000, VAT_8), orphan))).toBe(
      ORDER_ERROR_CODES.parentLineNotFound,
    );
  });
});
