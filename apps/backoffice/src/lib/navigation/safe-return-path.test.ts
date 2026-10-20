import { describe, expect, it } from "vitest";
import { currentSection } from "./admin-sections";
import { safeReturnPath } from "./safe-return-path";

describe("where signing in returns to", () => {
  it("returns to a page of this site, query included", () => {
    expect(safeReturnPath("/menu/products/abc?new=1")).toBe("/menu/products/abc?new=1");
  });

  it.each([null, "", "https://evil.example/", "//evil.example/x", "/\\evil.example", "menu"])(
    "goes home instead of to %j",
    (next) => {
      expect(safeReturnPath(next)).toBe("/");
    },
  );

  it("never returns to the sign-in page itself", () => {
    expect(safeReturnPath("/login?next=%2F")).toBe("/");
  });
});

describe("which menu entry is the current page", () => {
  it("picks the most specific section", () => {
    expect(currentSection("/menu/categories")).toBe("/menu/categories");
    expect(currentSection("/menu/products/abc")).toBe("/menu");
    expect(currentSection("/devices")).toBe("/devices");
  });

  it("does not match a section by prefix alone", () => {
    expect(currentSection("/menu-old")).toBeNull();
    expect(currentSection("/")).toBeNull();
  });
});
