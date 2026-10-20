import { describe, expect, it } from "vitest";
import { currentSection } from "./admin-sections";

describe("which menu entry is the current page", () => {
  it("picks the most specific section", () => {
    expect(currentSection("/menu/categories")).toBe("/menu/categories");
    expect(currentSection("/menu/products/abc")).toBe("/menu");
    expect(currentSection("/devices")).toBe("/devices");
    expect(currentSection("/reports/print-failures")).toBe("/reports/print-failures");
  });

  it("does not match a section by prefix alone", () => {
    expect(currentSection("/menu-old")).toBeNull();
    expect(currentSection("/")).toBeNull();
  });
});
