import { describe, expect, it } from "vitest";
import { CATEGORY_TONES, categoryTones, productMark } from "./product-mark";

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
