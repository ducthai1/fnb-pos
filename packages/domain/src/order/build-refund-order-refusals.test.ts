import { describe, expect, it } from "vitest";
import { quantity } from "../money";
import { type RefundRequestLine, buildRefund } from "./build-refund-order";
import { earlierRefund, paidMilkTea, teas } from "./build-refund-order-test-fixtures";
import { ORDER_ERROR_CODES as C } from "./order-error-codes";
import { codeOf, line, order, reversal, sequentialIds } from "./order-line-test-fixtures";
import type { Order, OrderStatus } from "./order-types";

const refundCode = (
  paid: Order,
  request: readonly RefundRequestLine[],
  existing: readonly Order[] = [],
  newLineId = sequentialIds(),
) => codeOf(() => buildRefund(paid, request, existing, { orderId: "r", newLineId }, "2026-10-21"));

const of = (lineId: string, units = 1): RefundRequestLine => ({
  lineId,
  quantity: quantity(units),
  restock: true,
});

/** Tea of 2 sent to the bar, one voided before the customer paid. */
const voidedBeforePayment = () => paidMilkTea([reversal("void-1", "tea", quantity(-1))]);

describe("buildRefund refuses", () => {
  it.each<[OrderStatus, string]>([
    ["draft", C.refundRequiresPaidOrder],
    ["cancelled", C.refundRequiresPaidOrder],
  ])("a %s order", (status, code) => {
    expect(refundCode({ ...paidMilkTea(), status }, [teas(1)])).toBe(code);
  });

  it.each<[string, RefundRequestLine[], string]>([
    ["an empty request", [], C.refundEmpty],
    ["a line that is not on the order", [of("ghost")], C.lineNotFound],
    ["a topping on its own", [of("pearl")], C.lineNotReversible],
    ["a zero quantity", [teas(0)], C.nonPositiveQuantity],
    ["a negative quantity", [teas(-1)], C.nonPositiveQuantity],
    ["more teas than were sold", [teas(3)], C.refundExceedsRemaining],
    [
      "two entries for one tea that together exceed it",
      [teas(1), teas(2)],
      C.refundExceedsRemaining,
    ],
  ])("%s", (_, request, code) => {
    expect(refundCode(paidMilkTea(), request)).toBe(code);
  });

  it("an order discount line, which is not a sold item", () => {
    const paid = paidMilkTea([line("order-discount", "discount", null)]);
    expect(refundCode(paid, [of("order-discount")])).toBe(C.lineNotReversible);
  });

  it("the negative line of a void, and a unit voided before payment", () => {
    expect(refundCode(voidedBeforePayment(), [of("void-1")])).toBe(C.lineNotReversible);
    expect(refundCode(voidedBeforePayment(), [teas(2)])).toBe(C.refundExceedsRemaining);
    expect(refundCode(voidedBeforePayment(), [teas(1)])).toBeUndefined();
  });

  it.each<[string, Order]>([
    ["draft", earlierRefund(1, "draft")],
    ["paid", earlierRefund(1, "paid")],
    ["posted", earlierRefund(1, "posted")],
  ])("units already on an earlier %s refund", (_, earlier) => {
    expect(refundCode(paidMilkTea(), [teas(2)], [earlier])).toBe(C.refundExceedsRemaining);
  });

  it("units spread over two earlier refunds", () => {
    const earlier = [earlierRefund(1, "paid", "a"), earlierRefund(1, "draft", "b")];
    expect(refundCode(paidMilkTea(), [teas(1)], earlier)).toBe(C.refundExceedsRemaining);
  });

  it.each<[string, Order]>([
    ["a refund of another order", { ...earlierRefund(1), refundOfOrderId: "order-2" }],
    ["an ordinary order", order([])],
  ])("an earlier-refund list holding %s", (_, stray) => {
    expect(refundCode(paidMilkTea(), [teas(1)], [stray])).toBe(C.refundOfAnotherOrder);
  });

  it("new line ids that clash with each other", () => {
    expect(refundCode(paidMilkTea(), [teas(1)], [], () => "same")).toBe(C.duplicateLineId);
  });
});
