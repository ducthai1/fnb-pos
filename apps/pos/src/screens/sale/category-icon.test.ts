import {
  Beer,
  Coffee,
  Croissant,
  CupSoda,
  LayoutGrid,
  Soup,
  Tag,
  UtensilsCrossed,
} from "lucide-react";
import { describe, expect, it } from "vitest";
import { categoryIcon } from "./category-icon";

describe("categoryIcon", () => {
  it("draws the whole menu as a grid", () => {
    expect(categoryIcon(null)).toBe(LayoutGrid);
  });

  it("reads the kind from the name, marks and case aside", () => {
    expect(categoryIcon("Cà phê pha máy")).toBe(Coffee);
    expect(categoryIcon("ĐỒ UỐNG")).toBe(CupSoda);
    expect(categoryIcon("Trà sữa")).toBe(CupSoda);
    expect(categoryIcon("Bánh mì")).toBe(Croissant);
    expect(categoryIcon("Bia & rượu")).toBe(Beer);
    expect(categoryIcon("Lẩu")).toBe(Soup);
    expect(categoryIcon("Món ăn chính")).toBe(UtensilsCrossed);
  });

  it("matches whole words, so a word inside another does not count", () => {
    // "trưa" begins like "trà" and "miến" like "mì", yet neither is that word.
    expect(categoryIcon("Combo trưa")).toBe(Tag);
    expect(categoryIcon("Miến")).toBe(Tag);
  });

  it("gives a plain tag to a name it cannot read", () => {
    expect(categoryIcon("Bé 🧋👨‍👩‍👧 đặc biệt")).toBe(Tag);
    expect(categoryIcon("")).toBe(Tag);
  });
});
