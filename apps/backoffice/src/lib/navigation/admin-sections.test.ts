import { describe, expect, it } from "vitest";
import { currentSection, groupedSectionsFor } from "./admin-sections";

describe("which menu entry is the current page", () => {
  it("picks the most specific section", () => {
    expect(currentSection("/menu/categories")).toBe("/menu/categories");
    expect(currentSection("/menu/products/abc")).toBe("/menu");
    expect(currentSection("/menu/price-lists/abc")).toBe("/menu/price-lists");
    expect(currentSection("/devices")).toBe("/devices");
    expect(currentSection("/reports/print-failures")).toBe("/reports/print-failures");
  });

  it("does not match a section by prefix alone", () => {
    expect(currentSection("/menu-old")).toBeNull();
    expect(currentSection("/")).toBeNull();
  });
});

describe("the groups of the menu", () => {
  it("keeps the menu's order and leaves out a group the keys open no page of", () => {
    const grouped = groupedSectionsFor(["view_reports"]).map(({ group, sections }) => [group, sections.map((s) => s.href)]);
    expect(grouped).toEqual([
      ["menu", ["/menu", "/menu/categories", "/menu/availability", "/menu/price-lists"]],
      ["sales", ["/reports/daily-sales", "/day-close", "/payments", "/reports/print-failures"]],
    ]);
  });
});
