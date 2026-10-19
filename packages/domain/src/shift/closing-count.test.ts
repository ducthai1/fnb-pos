import { describe, expect, it } from "vitest";
import { vnd } from "../money";
import { codeOf } from "../order/order-line-test-fixtures";
import { assessClosingCount } from "./closing-count";
import type { ShiftCashLedger } from "./expected-cash";
import { SHIFT_ERROR_CODES as C } from "./shift-error-codes";

/** Opened on 500.000 đ and sold 250.000 đ in cash: the drawer should hold 750.000 đ. */
const shift: ShiftCashLedger = {
  openingCash: vnd(500_000),
  events: [{ kind: "cash_sale", amount: vnd(250_000) }],
};
const close = (counted: number, tolerance: number) =>
  assessClosingCount(shift, vnd(counted), vnd(tolerance));

describe("assessClosingCount", () => {
  it("settles a drawer that matches without anyone accepting a difference", () => {
    expect(close(750_000, 0)).toEqual({
      expectedCash: vnd(750_000),
      countedCash: vnd(750_000),
      difference: vnd(0),
      needsAcceptance: false,
    });
  });

  it("reports a shortfall as a negative difference and a surplus as a positive one", () => {
    expect(close(730_000, 50_000).difference).toBe(vnd(-20_000));
    expect(close(770_000, 50_000).difference).toBe(vnd(20_000));
  });

  it("accepts a difference up to the tolerance, inclusive, on either side", () => {
    expect(close(745_000, 5_000).needsAcceptance).toBe(false);
    expect(close(755_000, 5_000).needsAcceptance).toBe(false);
  });

  it("needs acceptance one đồng past the tolerance, for a surplus as much as a shortfall", () => {
    expect(close(744_999, 5_000).needsAcceptance).toBe(true);
    expect(close(755_001, 5_000).needsAcceptance).toBe(true);
  });

  it("needs acceptance for any difference at all when the tolerance is zero", () => {
    expect(close(749_500, 0).needsAcceptance).toBe(true);
  });

  it("refuses a negative count or a negative tolerance", () => {
    expect(codeOf(() => close(-1, 0))).toBe(C.negativeAmount);
    expect(codeOf(() => close(750_000, -1))).toBe(C.negativeAmount);
  });
});
