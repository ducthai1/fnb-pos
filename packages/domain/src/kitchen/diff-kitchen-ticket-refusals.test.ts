import { describe, expect, it } from "vitest";
import { type Quantity, quantity } from "../money";
import { codeOf, order } from "../order/order-line-test-fixtures";
import { KITCHEN_ERROR_CODES as C } from "./kitchen-error-codes";
import { cancel, dish, send, topping } from "./kitchen-test-fixtures";

const teaOrder = order([dish("tea", 2), topping("pearl", "tea")]);
/** Built raw, since the point is a state the kitchen layer should never have produced. */
const sentTea = (thousandths: bigint) => [
  { lineId: "tea", sentQuantity: thousandths as Quantity, sentNote: null },
];

describe("kitchen tickets refuse a sent state that disagrees with the order", () => {
  it("accepts a state of none, some or all of a line's units", () => {
    for (const units of [0n, 1_000n, 2_000n]) {
      expect(codeOf(() => send(teaOrder, sentTea(units)))).toBeUndefined();
    }
  });

  it("refuses more units sent than the line holds, or fewer than none", () => {
    expect(codeOf(() => send(teaOrder, sentTea(2_001n)))).toBe(C.invalidSentQuantity);
    expect(codeOf(() => send(teaOrder, sentTea(-1n)))).toBe(C.invalidSentQuantity);
  });

  it("refuses more cancelled units printed than the cancel line takes back", () => {
    const sent = send(teaOrder, []).sentState;
    const { order: after, record } = cancel(teaOrder, sent, "tea", 1);
    const id = record.reversalLineId ?? "";
    const printed = (units: number) => [
      ...sent,
      { lineId: id, sentQuantity: quantity(units), sentNote: null },
    ];
    expect(codeOf(() => send(after, printed(1)))).toBeUndefined();
    expect(codeOf(() => send(after, printed(2)))).toBe(C.invalidSentQuantity);
  });

  it("refuses two states for one line", () => {
    const twice = [...sentTea(1_000n), ...sentTea(1_000n)];
    expect(codeOf(() => send(teaOrder, twice))).toBe(C.duplicateSentLine);
  });

  it("refuses a state for a line that is not a root item of the order", () => {
    const state = (lineId: string) => [{ lineId, sentQuantity: quantity(1), sentNote: null }];
    expect(codeOf(() => send(teaOrder, state("ghost")))).toBe(C.sentLineNotFound);
    expect(codeOf(() => send(teaOrder, state("pearl")))).toBe(C.sentLineNotFound);
  });

  it("refuses a refund order, which no station makes anything for", () => {
    const refund = order([], { refundOfOrderId: "order-0" });
    expect(codeOf(() => send(refund, []))).toBe(C.refundOrder);
    expect(codeOf(() => send(order([]), []))).toBeUndefined();
  });
});
