import { describe, expect, it } from "vitest";
import { quantity, vnd } from "../money";
import { ORDER_ERROR_CODES, type Order, buildRefund } from "../order";
import { codeOf, order, sequentialIds } from "../order/order-line-test-fixtures";
import { computeOrderTotals } from "./compute-order-totals";
import type { OrderTotals } from "./order-totals-types";
import { TOTALS_ERROR_CODES as C } from "./totals-error-codes";
import {
  TAX_EXCLUSIVE,
  VAT_10,
  VAT_8,
  discountLine,
  itemLine,
  modifierLine,
  orderOf,
  withServiceCharge,
} from "./totals-test-helpers";
import { orderLevel, voidUnits } from "./totals-void-test-helpers";

const profile = withServiceCharge(TAX_EXCLUSIVE);
const teas = (units: number) => [
  itemLine("tea", 35_000, VAT_8, quantity(units)),
  modifierLine("pearl", "tea", 7_000, VAT_8),
];
const burger = [itemLine("burger", 65_000, VAT_10), discountLine("off", "burger", 5_000, VAT_10)];
const paid = (o: Order): Order => ({ ...o, status: "paid" });
const units = (lineId: string, n: number) => ({ lineId, quantity: quantity(n), restock: true });
const refundOf = (sale: Order, request: ReturnType<typeof units>[]) =>
  buildRefund(sale, request, [], { orderId: "refund-1", newLineId: sequentialIds() }, "2026-10-21")
    .order;

/** What the customer gets back for a sale: every amount of it, negative. */
const negated = (t: OrderTotals) => ({
  ...orderLevel(t),
  grossTotal: -t.grossTotal,
  discountTotal: -t.discountTotal,
  netTotal: -t.netTotal,
  serviceCharge: -t.serviceCharge,
  serviceChargeTax: -t.serviceChargeTax,
  taxBreakdown: t.taxBreakdown.map((g) => ({ rate: g.rate, base: -g.base, tax: -g.tax })),
  taxTotal: -t.taxTotal,
  amountDue: -t.amountDue,
});

describe("computeOrderTotals on a refund", () => {
  it("refunds a whole order at once and gives back exactly what it charged", () => {
    const sale = paid(order([...teas(2), ...burger]));
    const refund = refundOf(sale, [units("tea", 2), units("burger", 1)]);
    const totals = computeOrderTotals(refund, profile);
    expect(orderLevel(totals)).toEqual(negated(computeOrderTotals(sale, profile)));
    // 70.000 + 14.000 at 8%, 65.000 - 5.000 at 10%, 5% service charge on 144.000 taxed at 10%
    expect(totals.amountDue).toBe(vnd(-164_640));
    expect(totals.lines.map((l) => [l.lineId, l.gross, l.discountAllocated])).toEqual([
      ["new-1", vnd(-70_000), vnd(0)],
      ["new-2", vnd(-14_000), vnd(0)],
      ["new-3", vnd(-65_000), vnd(-5_000)],
    ]);
  });

  it("gives back what was paid for an order with a void, and not the voided tea", () => {
    const sale = paid(voidUnits(order([...teas(2), ...burger]), "tea", quantity(1), quantity(2)));
    const refund = refundOf(sale, [units("tea", 1), units("burger", 1)]);
    const totals = computeOrderTotals(refund, profile);
    expect(orderLevel(totals)).toEqual(negated(computeOrderTotals(sale, profile)));
  });

  it("refunds one of two teas as the mirror image of selling one", () => {
    const refund = refundOf(paid(order([...teas(2), ...burger])), [units("tea", 1)]);
    const oneTea = computeOrderTotals(orderOf(teas(1)), profile);
    expect(orderLevel(computeOrderTotals(refund, profile))).toEqual(negated(oneTea));
  });

  it("refuses a refund that also sells something or takes a discount of its own", () => {
    const refund = refundOf(paid(order(teas(2))), [units("tea", 1)]);
    const selling = { ...refund, lines: [...refund.lines, itemLine("cake", 30_000, VAT_8)] };
    expect(codeOf(() => computeOrderTotals(selling, profile))).toBe(C.mixedSaleAndRefund);
    const discounted = {
      ...refund,
      lines: [...refund.lines, discountLine("x", null, 1_000, VAT_8)],
    };
    expect(codeOf(() => computeOrderTotals(discounted, profile))).toBe(C.mixedSaleAndRefund);
    expect(codeOf(() => computeOrderTotals(refund, profile))).toBeUndefined();
  });

  it("reads lines without refundOfOrderId as an ordinary order, whose voids must be its own", () => {
    const refund = refundOf(paid(order(teas(2))), [units("tea", 1)]);
    expect(codeOf(() => computeOrderTotals({ ...refund, refundOfOrderId: null }, profile))).toBe(
      ORDER_ERROR_CODES.reversedLineNotFound,
    );
  });
});
