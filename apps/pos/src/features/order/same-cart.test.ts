import { quantity, vnd } from "@fnb/domain";
import { describe, expect, it } from "vitest";
import type { CounterOrder } from "./counter-order";
import { sameCart } from "./same-cart";

const order = (lines: unknown[], extra: Partial<CounterOrder> = {}): CounterOrder =>
  ({
    orderId: "o-1",
    deviceOrderNo: 7,
    serviceType: "dine_in",
    tableTag: null,
    table: { id: "t-1", name: "Bàn ngoài hiên số 19 cạnh cây bàng" },
    lines,
    ...extra,
  }) as CounterOrder;

const coffee = (changes: Record<string, unknown> = {}) => ({
  lineId: "l-1",
  productId: "p-1",
  quantity: quantity("999"),
  unitPrice: vnd(29_000n),
  note: "ít đường, nhiều đá, không đánh thêm trân châu đen",
  ...changes,
});

describe("whether a cart change changed anything", () => {
  it("sees a copy with the same content, bigints included, as the same cart", () => {
    expect(sameCart(order([coffee()]), order([coffee()]))).toBe(true);
  });

  it.each([
    ["a quantity", order([coffee({ quantity: quantity("998") })])],
    ["a weight in grams", order([coffee({ quantity: quantity("0.351") })])],
    ["a note", order([coffee({ note: "ít đường" })])],
    ["a price", order([coffee({ unitPrice: vnd(28_999n) })])],
    ["a line added", order([coffee(), coffee({ lineId: "l-2" })])],
    ["the tag", order([coffee()], { tableTag: "19" })],
    ["the service", order([coffee()], { serviceType: "takeaway" })],
  ])("sees a change of %s", (_what, changed) => {
    expect(sameCart(order([coffee()]), changed)).toBe(false);
  });
});
