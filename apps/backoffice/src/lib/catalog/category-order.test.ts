import { describe, expect, it } from "vitest";
import type { Category } from "../api/catalog-api";
import { inMenuOrder, moveCategory } from "./category-order";

const category = (id: string, sortOrder: number, name = id): Category => ({ id, brandId: "b", name, sortOrder, version: 1 });
const ids = (writes: { category: Category; sortOrder: number }[]) => writes.map((write) => [write.category.id, write.sortOrder]);

describe("the order of the menu's categories", () => {
  it("is by position, then by name for the same position", () => {
    expect(inMenuOrder([category("c", 20), category("b", 10, "Trà"), category("a", 10, "Cà phê")]).map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("moves one up by writing only the two that change places", () => {
    const list = [category("a", 10), category("b", 20), category("c", 30)];
    expect(ids(moveCategory(list, 2, -1))).toEqual([
      ["c", 20],
      ["b", 30],
    ]);
    expect(ids(moveCategory(list, 0, 1))).toEqual([
      ["b", 10],
      ["a", 20],
    ]);
  });

  it("numbers an uneven list again by tens, writing whatever changes", () => {
    const list = [category("a", 5), category("b", 5, "z"), category("c", 70)];
    expect(ids(moveCategory(list, 1, -1))).toEqual([
      ["b", 10],
      ["a", 20],
      ["c", 30],
    ]);
  });

  it("writes nothing past either end", () => {
    const list = [category("a", 10), category("b", 20)];
    expect(moveCategory(list, 0, -1)).toEqual([]);
    expect(moveCategory(list, 1, 1)).toEqual([]);
    expect(moveCategory(list, 5, -1)).toEqual([]);
  });
});
