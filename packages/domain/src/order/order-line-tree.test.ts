import { describe, expect, it } from "vitest";
import { quantity, quantityFromThousandths } from "../money";
import { ORDER_ERROR_CODES as C } from "./order-error-codes";
import { validateLineTree } from "./order-line-tree";
import { codeOf, item, line } from "./order-line-test-fixtures";
import type { OrderLine } from "./order-types";

describe("validateLineTree", () => {
  it("accepts a whole order: toppings, a combo with picks, line and order discounts", () => {
    const lines = [
      item("tea", quantity(2)),
      line("pearl", "modifier", "tea", quantity(2)),
      line("tea-discount", "discount", "tea"),
      item("combo"),
      line("burger", "combo_component", "combo"),
      line("cheese", "modifier", "burger"),
      line("combo-size", "modifier", "combo"),
      line("order-discount", "discount", null),
    ];
    expect(codeOf(() => validateLineTree(lines))).toBeUndefined();
  });

  it.each<[string, OrderLine[]]>([
    ["two items with different ids", [item("a"), item("b")]],
    ["a modifier under an item that is on the order", [item("a"), line("m", "modifier", "a")]],
    ["an item at the root", [item("a")]],
    [
      "a modifier under a combo component",
      [item("a"), line("c", "combo_component", "a"), line("m", "modifier", "c")],
    ],
    ["a combo component under an item", [item("a"), line("c", "combo_component", "a")]],
    ["a discount at the root, reducing the whole order", [item("a"), line("d", "discount", null)]],
    ["a discount under an item, reducing that line", [item("a"), line("d", "discount", "a")]],
    ["the smallest positive quantity, one thousandth", [item("a", quantityFromThousandths(1n))]],
  ])("accepts %s", (_, lines) => {
    expect(codeOf(() => validateLineTree(lines))).toBeUndefined();
  });

  it.each<[string, OrderLine[], string]>([
    ["two lines sharing an id", [item("a"), item("a")], C.duplicateLineId],
    [
      "a parent id that is not on the order",
      [item("a"), line("m", "modifier", "ghost")],
      C.parentLineNotFound,
    ],
    ["a line that is its own parent", [line("m", "modifier", "m")], C.lineCycle],
    [
      "two lines that are each other's parent",
      [line("m1", "modifier", "m2"), line("m2", "modifier", "m1")],
      C.lineCycle,
    ],
    ["an item under another item", [item("a"), line("b", "item", "a")], C.itemNotRoot],
    ["a modifier at the root", [line("m", "modifier", null)], C.invalidModifierParent],
    [
      "a modifier under a modifier",
      [item("a"), line("m1", "modifier", "a"), line("m2", "modifier", "m1")],
      C.invalidModifierParent,
    ],
    [
      "a modifier under a discount",
      [item("a"), line("d", "discount", "a"), line("m", "modifier", "d")],
      C.invalidModifierParent,
    ],
    [
      "a combo component at the root",
      [line("c", "combo_component", null)],
      C.invalidComboComponentParent,
    ],
    [
      "a combo component under a combo component",
      [item("a"), line("c1", "combo_component", "a"), line("c2", "combo_component", "c1")],
      C.invalidComboComponentParent,
    ],
    [
      "a combo component under a modifier",
      [item("a"), line("m", "modifier", "a"), line("c", "combo_component", "m")],
      C.invalidComboComponentParent,
    ],
    [
      "a discount under a combo component",
      [item("a"), line("c", "combo_component", "a"), line("d", "discount", "c")],
      C.invalidDiscountParent,
    ],
    [
      "a discount under a modifier",
      [item("a"), line("m", "modifier", "a"), line("d", "discount", "m")],
      C.invalidDiscountParent,
    ],
    [
      "a discount under a discount",
      [item("a"), line("d1", "discount", "a"), line("d2", "discount", "d1")],
      C.invalidDiscountParent,
    ],
    ["a zero quantity", [item("a", quantity(0))], C.nonPositiveQuantity],
    [
      "a negative quantity on a child line",
      [item("a"), line("m", "modifier", "a", quantity(-1))],
      C.nonPositiveQuantity,
    ],
  ])("refuses %s", (_, lines, code) => {
    expect(codeOf(() => validateLineTree(lines))).toBe(code);
  });
});
