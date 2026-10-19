import { describe, expect, it } from "vitest";
import { quantity } from "../money";
import { ORDER_ERROR_CODES as C } from "./order-error-codes";
import { codeOf, order, reversal } from "./order-line-test-fixtures";
import type { Order, OrderStatus } from "./order-types";
import { type VoidLineRequest, voidLine } from "./void-order-line";
import { milkTeaDraft, voidRequest } from "./void-order-line-test-fixtures";

const sentBy = (approvedByStaffId: string | null): Partial<VoidLineRequest> => ({
  sentQuantity: quantity(2),
  approvedByStaffId,
});

/** Tea of 2, both sent, one already cancelled by a negative line. */
const oneCancelled = (): Order => milkTeaDraft([reversal("void-1", "tea", quantity(-1))]);

describe("voidLine refuses", () => {
  it.each<[string, Partial<VoidLineRequest>, string]>([
    ["more units than the line holds", { quantity: quantity(3) }, C.voidExceedsRemaining],
    ["a zero quantity", { quantity: quantity(0) }, C.nonPositiveQuantity],
    ["a negative quantity", { quantity: quantity(-1) }, C.nonPositiveQuantity],
    ["an empty reason", { reasonCode: "" }, C.voidReasonRequired],
    ["a reason of only spaces", { reasonCode: "   " }, C.voidReasonRequired],
    ["a sent unit with no approver", sentBy(null), C.voidNeedsApproval],
    ["a sent unit with a blank approver", sentBy("  "), C.voidNeedsApproval],
    ["a line that is not on the order", { lineId: "ghost" }, C.lineNotFound],
    ["a topping on its own", { lineId: "pearl" }, C.lineNotReversible],
    ["more sent units than the line holds", { sentQuantity: quantity(3) }, C.invalidSentQuantity],
    ["a negative sent quantity", { sentQuantity: quantity(-1) }, C.invalidSentQuantity],
    [
      "new ids that clash with lines on the order",
      { ...sentBy("m"), newLineId: () => "coffee" },
      C.duplicateLineId,
    ],
  ])("%s", (_, overrides, code) => {
    expect(codeOf(() => voidLine(milkTeaDraft(), voidRequest(overrides)))).toBe(code);
  });

  it.each<[OrderStatus, string]>([
    ["paid", C.alreadyPaid],
    ["posted", C.alreadyPosted],
    ["cancelled", C.alreadyCancelled],
  ])("any line of a %s order", (status, code) => {
    const closed = { ...milkTeaDraft(), status };
    expect(codeOf(() => voidLine(closed, voidRequest()))).toBe(code);
  });

  it("more than is left after an earlier cancel, but allows exactly what is left", () => {
    const request = voidRequest({ ...sentBy("manager-1"), quantity: quantity(2) });
    expect(codeOf(() => voidLine(oneCancelled(), request))).toBe(C.voidExceedsRemaining);
    const rest = voidRequest({ ...sentBy("manager-1"), quantity: quantity(1) });
    expect(codeOf(() => voidLine(oneCancelled(), rest))).toBeUndefined();
  });

  it("a negative line, which is itself a void", () => {
    const request = voidRequest({ ...sentBy("manager-1"), lineId: "void-1" });
    expect(codeOf(() => voidLine(oneCancelled(), request))).toBe(C.lineNotReversible);
  });

  it("a sent quantity below what negative lines already cancelled", () => {
    const request = voidRequest({ sentQuantity: quantity(0) });
    expect(codeOf(() => voidLine(oneCancelled(), request))).toBe(C.invalidSentQuantity);
  });

  it("an order whose lines are already broken, before looking at the request", () => {
    const broken = order([reversal("void-1", "ghost", quantity(-1))]);
    expect(codeOf(() => voidLine(broken, voidRequest()))).toBe(C.reversedLineNotFound);
  });
});
