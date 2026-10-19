import { describe, expect, it } from "vitest";
import { quantity } from "../money";
import { ORDER_ERROR_CODES as C } from "./order-error-codes";
import { effectiveQuantity, validateLineTree } from "./order-line-tree";
import { codeOf, copyOf, item, line, order, reversal } from "./order-line-test-fixtures";
import type { OrderLine } from "./order-types";
import { voidLine } from "./void-order-line";
import { voidRequest } from "./void-order-line-test-fixtures";

const wholeLine = (l: OrderLine): OrderLine => ({ ...l, wholeParentLine: true });
const threeCups = (): OrderLine[] => [
  item("tea", quantity(3)),
  wholeLine(line("off", "discount", "tea")),
  item("coffee", quantity(2)),
];

describe("a whole-line discount", () => {
  it("stands for its own quantity, not one per unit of its item", () => {
    expect(effectiveQuantity(threeCups(), "off")).toBe(quantity(1));
    const perCup = [item("tea", quantity(3)), line("off", "discount", "tea")];
    expect(effectiveQuantity(perCup, "off")).toBe(quantity(3));
  });

  it.each<[string, OrderLine[]]>([
    ["on a topping", [item("tea"), wholeLine(line("m", "modifier", "tea"))]],
    ["on an order discount", [item("tea"), wholeLine(line("d", "discount", null))]],
    ["on an item", [wholeLine(item("tea"))]],
    ["on a combo pick", [item("c"), wholeLine(line("p", "combo_component", "c"))]],
  ])("is refused %s, where it would mean nothing or price a topping once per line", (_, lines) => {
    expect(codeOf(() => validateLineTree(lines))).toBe(C.wholeLineDiscountMisplaced);
  });

  it("set to false is an ordinary line anywhere", () => {
    const lines = [{ ...item("tea"), wholeParentLine: false }];
    expect(codeOf(() => validateLineTree(lines))).toBeUndefined();
  });

  it.each([
    ["units the kitchen has not seen", quantity(0)],
    ["units already sent", quantity(3)],
  ])("blocks voiding %s of its item, which would raise its rate unjudged", (_, sent) => {
    const draft = order(threeCups());
    const request = voidRequest({ sentQuantity: sent, approvedByStaffId: "manager-1" });
    expect(codeOf(() => voidLine(draft, request))).toBe(C.voidBlockedByWholeLineDiscount);
    // another item on the same order is voided as usual
    const coffee = voidRequest({ lineId: "coffee", sentQuantity: quantity(0) });
    expect(codeOf(() => voidLine(draft, coffee))).toBeUndefined();
  });

  it("blocks a hand-made cancel of its item too, even one that copies the discount", () => {
    const lines = [
      ...threeCups(),
      reversal("r", "tea", quantity(-1)),
      wholeLine(copyOf("r-off", "off", "discount", "r")),
    ];
    expect(codeOf(() => validateLineTree(lines))).toBe(C.voidBlockedByWholeLineDiscount);
  });
});
