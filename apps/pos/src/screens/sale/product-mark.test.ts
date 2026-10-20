import { describe, expect, it } from "vitest";
import {
  CATEGORY_TONES,
  categoryTones,
  inCategoryOrder,
  productMark,
  unitsByProduct,
} from "./product-mark";

describe("productMark", () => {
  it("takes the first letter of the first two words, marks and all", () => {
    expect(productMark("Cà phê sữa")).toBe("CP");
    expect(productMark("  ổi ép  ")).toBe("ỔÉ");
    expect(productMark("Croissant")).toBe("C");
  });

  it("keeps an emoji whole and falls back for an empty name", () => {
    const family = String.fromCodePoint(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);
    expect(productMark(`${family} combo`)).toBe(`${family}C`);
    expect(productMark("   ")).toBe("?");
  });
});

describe("categoryTones", () => {
  it("gives categories colours by their place and cycles after the last", () => {
    const categories = Array.from({ length: CATEGORY_TONES + 2 }, (_, i) => ({ id: `c${i}` }));
    const tones = categoryTones(categories);
    expect(tones.get("c0")).toBe(1);
    expect(tones.get(`c${CATEGORY_TONES - 1}`)).toBe(CATEGORY_TONES);
    expect(tones.get(`c${CATEGORY_TONES}`)).toBe(1);
  });
});

describe("unitsByProduct", () => {
  it("adds up the units of a product across its lines (two sizes, two lines)", () => {
    const units = unitsByProduct([
      { productId: "tea", quantity: 2 },
      { productId: "coffee", quantity: 1 },
      { productId: "tea", quantity: 3 },
    ]);
    expect(units.get("tea")).toBe(5);
    expect(units.get("coffee")).toBe(1);
    expect(units.get("cake")).toBeUndefined();
  });
});

describe("inCategoryOrder", () => {
  it("puts products in the menu's category order, keeping their order inside each", () => {
    const products = [
      { name: "Bánh flan", categoryId: "food" },
      { name: "Bạc xỉu", categoryId: "coffee" },
      { name: "Nước suối", categoryId: null },
      { name: "Cà phê sữa", categoryId: "coffee" },
      { name: "Gone", categoryId: "archived" },
      { name: "Croissant", categoryId: "food" },
    ];
    const ordered = inCategoryOrder(products, [{ id: "coffee" }, { id: "food" }]);
    expect(ordered.map((product) => product.name)).toEqual([
      "Bạc xỉu",
      "Cà phê sữa",
      "Bánh flan",
      "Croissant",
      "Nước suối",
      "Gone",
    ]);
  });
});
