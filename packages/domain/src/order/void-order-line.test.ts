import { describe, expect, it } from "vitest";
import { quantity, vnd } from "../money";
import { effectiveQuantity, validateLineTree } from "./order-line-tree";
import { codeOf, item, line, linesTotal, order, sequentialIds } from "./order-line-test-fixtures";
import { voidLine } from "./void-order-line";
import { milkTeaDraft, voidRequest } from "./void-order-line-test-fixtures";

const ids = (lines: readonly { id: string }[]) => lines.map((l) => l.id);

describe("voidLine on units the kitchen has not seen", () => {
  it("removes a whole unsent line together with its toppings", () => {
    const draft = milkTeaDraft();
    const { order: after, record } = voidLine(draft, voidRequest({ quantity: quantity(2) }));
    expect(ids(after.lines)).toEqual(["coffee"]);
    expect(linesTotal(after.lines)).toBe(vnd(10_000));
    expect(record).toEqual({
      lineId: "tea",
      quantity: quantity(2),
      fromUnsent: quantity(2),
      fromSent: quantity(0),
      reasonCode: "customer_changed_mind",
      staffId: "cashier-1",
      approvedByStaffId: null,
      reversalLineId: null,
    });
  });

  it("lowers a partly voided line in place; its toppings follow per unit", () => {
    const draft = milkTeaDraft();
    const { order: after } = voidLine(draft, voidRequest());
    expect(ids(after.lines)).toEqual(["tea", "pearl", "coffee"]);
    expect(effectiveQuantity(after.lines, "tea")).toBe(quantity(1));
    expect(effectiveQuantity(after.lines, "pearl")).toBe(quantity(2));
    expect(linesTotal(after.lines)).toBe(vnd(30_000));
  });

  it("needs no approver when only unsent units go, even at a branch that wants approvals", () => {
    const request = voidRequest({ sentQuantity: quantity(1) });
    expect(voidLine(milkTeaDraft(), request).record.fromUnsent).toBe(quantity(1));
  });

  it("returns a new order one version up and leaves the input as it was", () => {
    const draft = milkTeaDraft();
    const { order: after } = voidLine(draft, voidRequest());
    expect(after).not.toBe(draft);
    expect(after.version).toBe(5);
    expect(draft.version).toBe(4);
    expect(effectiveQuantity(draft.lines, "tea")).toBe(quantity(2));
  });
});

describe("voidLine on units already sent to the bar", () => {
  it("adds a negative tea with copies of its pearls, so the order is worth 20.000 đ less", () => {
    const request = voidRequest({ sentQuantity: quantity(2), approvedByStaffId: "manager-1" });
    const { order: after, record } = voidLine(milkTeaDraft(), request);
    expect(ids(after.lines)).toEqual(["tea", "pearl", "coffee", "new-1", "new-2"]);
    const [voidTea, voidPearl] = after.lines.slice(3);
    expect(voidTea).toMatchObject({
      reversesLineId: "tea",
      parentLineId: null,
      quantity: quantity(-1),
    });
    expect(voidPearl).toMatchObject({
      reversesLineId: null,
      parentLineId: "new-1",
      quantity: quantity(2),
      unitPrice: vnd(5_000),
      modifierOptionId: "option-pearl",
    });
    expect(effectiveQuantity(after.lines, "new-2")).toBe(quantity(-2));
    expect(linesTotal(after.lines)).toBe(vnd(30_000));
    expect(record).toMatchObject({
      fromUnsent: quantity(0),
      fromSent: quantity(1),
      approvedByStaffId: "manager-1",
      reversalLineId: "new-1",
    });
  });

  it("takes the unsent unit first and reverses only the sent one", () => {
    const request = voidRequest({
      quantity: quantity(2),
      sentQuantity: quantity(1),
      approvedByStaffId: "manager-1",
    });
    const { order: after, record } = voidLine(milkTeaDraft(), request);
    expect(record).toMatchObject({ fromUnsent: quantity(1), fromSent: quantity(1) });
    expect(effectiveQuantity(after.lines, "tea")).toBe(quantity(1));
    expect(effectiveQuantity(after.lines, "new-1")).toBe(quantity(-1));
    expect(linesTotal(after.lines)).toBe(vnd(10_000));
  });

  it("voids the last unit left after an earlier cancel of a sent unit", () => {
    const sent = { sentQuantity: quantity(2), approvedByStaffId: "manager-1" };
    const first = voidLine(milkTeaDraft(), voidRequest(sent));
    const second = voidLine(first.order, voidRequest({ ...sent, newLineId: sequentialIds("b") }));
    expect(second.record.fromSent).toBe(quantity(1));
    expect(ids(second.order.lines)).toEqual([
      "tea",
      "pearl",
      "coffee",
      "new-1",
      "new-2",
      "b-1",
      "b-2",
    ]);
    expect(linesTotal(second.order.lines)).toBe(vnd(10_000));
  });

  it("goes through without an approver when the branch does not ask for one", () => {
    const request = voidRequest({ sentQuantity: quantity(2), requireApprovalAfterSent: false });
    expect(voidLine(milkTeaDraft(), request).record.fromSent).toBe(quantity(1));
  });

  it("cancels a combo with its picks and their extras, re-parented under the new line", () => {
    const draft = order([
      item("combo"),
      line("burger", "combo_component", "combo"),
      line("cheese", "modifier", "burger", quantity(2)),
    ]);
    const request = voidRequest({
      lineId: "combo",
      sentQuantity: quantity(1),
      approvedByStaffId: "m",
    });
    const { order: after } = voidLine(draft, request);
    expect(after.lines.slice(3).map((l) => [l.id, l.parentLineId])).toEqual([
      ["new-1", null],
      ["new-2", "new-1"],
      ["new-3", "new-2"],
    ]);
    expect(effectiveQuantity(after.lines, "new-3")).toBe(quantity(-2));
    expect(linesTotal(after.lines)).toBe(vnd(0));
    expect(codeOf(() => validateLineTree(after.lines))).toBeUndefined();
  });
});
