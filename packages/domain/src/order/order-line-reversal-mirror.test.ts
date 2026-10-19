import { describe, expect, it } from "vitest";
import { errorOf } from "../catalog/catalog-test-helpers";
import { quantity, vnd } from "../money";
import { ORDER_ERROR_CODES as C } from "./order-error-codes";
import { validateLineTree } from "./order-line-tree";
import { codeOf, copyOf, item, line, reversal } from "./order-line-test-fixtures";
import type { OrderLine } from "./order-types";
import { voidLine } from "./void-order-line";
import { milkTeaDraft, teaCancel, voidRequest } from "./void-order-line-test-fixtures";

/** One of two sent teas cancelled the way voidLine does it: the cancel copies the pearls. */
const cancelled = (): OrderLine[] => [...milkTeaDraft().lines, ...teaCancel("void-1", 1)];

/** The lines with `id` replaced by `change(line)`. */
const edited = (lines: OrderLine[], id: string, change: (l: OrderLine) => OrderLine) =>
  lines.map((l) => (l.id === id ? change(l) : l));

const fieldOf = (lines: readonly OrderLine[]) =>
  errorOf(() => validateLineTree(lines)).details?.["field"];

describe("a cancel line must copy the item it takes back", () => {
  it("accepts what voidLine builds, toppings, combo picks and line discount included", () => {
    const combo: OrderLine[] = [
      item("combo", quantity(2)),
      line("burger", "combo_component", "combo"),
      line("cheese", "modifier", "burger", quantity(2)),
      line("fries", "combo_component", "combo"),
      line("combo-off", "discount", "combo"),
    ];
    const draft = { ...milkTeaDraft(), lines: combo };
    const request = voidRequest({ lineId: "combo", sentQuantity: quantity(2) });
    const { order } = voidLine(draft, { ...request, approvedByStaffId: "manager-1" });
    expect(order.lines).toHaveLength(10);
    expect(codeOf(() => validateLineTree(order.lines))).toBeUndefined();
    // the copies may come in any order: position in `lines` carries no meaning
    expect(codeOf(() => validateLineTree([...order.lines].reverse()))).toBeUndefined();
  });

  it("accepts two tills each cancelling one tea with its own copy of the pearls", () => {
    const lines = [...milkTeaDraft().lines, ...teaCancel("r1", 1), ...teaCancel("r2", 1)];
    expect(codeOf(() => validateLineTree(lines))).toBeUndefined();
  });

  it.each<[string, (l: OrderLine) => OrderLine, string]>([
    ["ten times the price", (l) => ({ ...l, unitPrice: vnd(100_000) }), "unitPrice"],
    ["another product", (l) => ({ ...l, productId: "product-coffee" }), "productId"],
    ["another variant", (l) => ({ ...l, variantId: "large" }), "variantId"],
    ["another tax rate", (l) => ({ ...l, taxRate: 1000 as OrderLine["taxRate"] }), "taxRate"],
    ["another price source", (l) => ({ ...l, priceSource: "manual" }), "priceSource"],
  ])("refuses a cancel line at %s", (_, change, field) => {
    const lines = edited(cancelled(), "void-1", change);
    expect(codeOf(() => validateLineTree(lines))).toBe(C.reversalMismatch);
    expect(fieldOf(lines)).toBe(field);
  });

  it.each<[string, (lines: OrderLine[]) => OrderLine[]]>([
    [
      "a 500.000 đ topping hung under the cancel line",
      (lines) => [...lines, { ...line("gold", "modifier", "void-1"), unitPrice: vnd(500_000) }],
    ],
    ["the pearls left out of the cancel", (lines) => lines.filter((l) => l.id !== "void-1-pearl")],
    [
      "the pearls copied at another price",
      (lines) => edited(lines, "void-1-pearl", (l) => ({ ...l, unitPrice: vnd(50_000) })),
    ],
    [
      "the pearls copied at another quantity per tea",
      (lines) => edited(lines, "void-1-pearl", (l) => ({ ...l, quantity: quantity(20) })),
    ],
    [
      "another topping copied in place of the pearls",
      (lines) => edited(lines, "void-1-pearl", (l) => ({ ...l, modifierOptionId: "jelly" })),
    ],
    [
      "a topping added to the tea after the cancel",
      (lines) => [...lines, line("jelly", "modifier", "tea")],
    ],
    [
      "a line discount added to the tea after the cancel",
      (lines) => [...lines, line("tea-off", "discount", "tea")],
    ],
  ])("refuses %s", (_, change) => {
    const lines = change(cancelled());
    expect(codeOf(() => validateLineTree(lines))).toBe(C.reversalMismatch);
    expect(fieldOf(lines)).toBe("children");
  });

  it("compares nested picks too: a combo cancel whose burger lost its cheese is refused", () => {
    const lines = [
      item("combo"),
      line("burger", "combo_component", "combo"),
      line("cheese", "modifier", "burger"),
      reversal("r", "combo", quantity(-1)),
      copyOf("r-burger", "burger", "combo_component", "r"),
    ];
    expect(codeOf(() => validateLineTree(lines))).toBe(C.reversalMismatch);
    const withCheese = [...lines, copyOf("r-cheese", "cheese", "modifier", "r-burger")];
    expect(codeOf(() => validateLineTree(withCheese))).toBeUndefined();
  });

  it("does not compare the display name or the note, which are never priced", () => {
    const lines = edited(cancelled(), "void-1", (l) => ({ ...l, nameSnapshot: "", note: "x" }));
    expect(codeOf(() => validateLineTree(lines))).toBeUndefined();
  });

  it("leaves a refund's lines to validateRefundAgainstSale: their targets are on the sale", () => {
    const lines = [{ ...reversal("r", "sold", quantity(-1)), unitPrice: vnd(9_999_999) }];
    expect(codeOf(() => validateLineTree(lines, { refundOfOrderId: "sale" }))).toBeUndefined();
  });
});
