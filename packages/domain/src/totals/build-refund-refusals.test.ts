import { describe, expect, it } from "vitest";
import { quantity, vnd } from "../money";
import { ORDER_ERROR_CODES, type Order, type RefundLineAmounts } from "../order";
import { buildRefundLines } from "../order/build-refund-order";
import { codeOf, order, sequentialIds } from "../order/order-line-test-fixtures";
import { buildRefund } from "./build-refund";
import { computeOrderTotals } from "./compute-order-totals";
import { TOTALS_ERROR_CODES as C } from "./totals-error-codes";
import {
  TAX_INCLUSIVE,
  VAT_8,
  itemLine,
  modifierLine,
  withServiceCharge,
} from "./totals-test-helpers";
import { paid, units } from "./totals-refund-test-helpers";

const profile = withServiceCharge(TAX_INCLUSIVE);
const sale = paid(
  order([itemLine("tea", 30_000, VAT_8, quantity(2)), modifierLine("pearl", "tea", 5_000, VAT_8)]),
);
const ids = (id: string) => ({ orderId: id, newLineId: sequentialIds(id) });
const refundOf = (existing: readonly Order[] = [], id = "r2") =>
  buildRefund(sale, [units("tea", 1)], existing, ids(id), "2026-10-21", profile).order;
const withAmounts = (refund: Order, lines: readonly RefundLineAmounts[]): Order => ({
  ...refund,
  refundAmounts: refund.refundAmounts && { ...refund.refundAmounts, lines },
});

describe("buildRefund refuses", () => {
  it("an earlier refund that counts but carries no amounts, so what it took is unknown", () => {
    const unpriced = buildRefundLines(sale, [units("tea", 1)], [], ids("r1"), "2026-10-21").order;
    expect(codeOf(() => refundOf([unpriced]))).toBe(C.earlierRefundWithoutAmounts);
    const cancelled = { ...unpriced, status: "cancelled" as const };
    expect(codeOf(() => refundOf([cancelled]))).toBeUndefined();
    expect(codeOf(() => refundOf([refundOf([], "r1")]))).toBeUndefined();
  });

  it("an earlier refund whose amounts give back a line that was never sold", () => {
    const earlier = refundOf([], "r1");
    const entries = earlier.refundAmounts?.lines ?? [];
    const stray = withAmounts(
      earlier,
      entries.map((e) => ({ ...e, soldLineId: "cake" })),
    );
    expect(codeOf(() => refundOf([stray]))).toBe(C.invalidRefundAmounts);
  });

  it("more than is left, like the lines it builds on", () => {
    const twice = [units("tea", 2), units("tea", 1)];
    expect(codeOf(() => buildRefund(sale, twice, [], ids("r"), "2026-10-21", profile))).toBe(
      ORDER_ERROR_CODES.refundExceedsRemaining,
    );
  });
});

describe("computeOrderTotals refuses refund amounts that do not match the lines", () => {
  const refund = refundOf();
  const entries = refund.refundAmounts?.lines ?? [];
  const entry = (i: number): RefundLineAmounts => {
    const found = entries[i];
    if (!found) throw new Error(`the refund has no amounts entry ${i}`);
    return found;
  };
  const [tea, pearl] = [entry(0), entry(1)];

  it("reads the amounts a refund was built with", () => {
    expect(entries.map((e) => e.soldLineId)).toEqual(["tea", "pearl"]);
    expect(codeOf(() => computeOrderTotals(refund, profile))).toBeUndefined();
  });

  it.each([
    ["a goods line with no amounts", entries.slice(1)],
    ["amounts for a line that is not on the refund", [...entries, { ...tea, lineId: "x" }]],
    ["two entries for one line", [...entries, tea]],
    ["an amount that takes money instead of giving it back", [tea, { ...pearl, tax: vnd(1) }]],
    [
      "a discount kept back larger than the price",
      [{ ...tea, discountAllocated: vnd(-40_000) }, pearl],
    ],
  ])("%s", (_, lines) => {
    expect(codeOf(() => computeOrderTotals(withAmounts(refund, lines), profile))).toBe(
      C.invalidRefundAmounts,
    );
  });

  it("refund amounts on an ordinary order", () => {
    const sold = { ...sale, refundAmounts: refund.refundAmounts };
    expect(codeOf(() => computeOrderTotals(sold, profile))).toBe(C.mixedSaleAndRefund);
  });
});
