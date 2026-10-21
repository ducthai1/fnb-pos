import { describe, expect, it } from "vitest";
import { listOf, readFrontMatter } from "./handbook-front-matter";

describe("the front matter of a handbook page", () => {
  it("reads scalars, empty lists and indented lists", () => {
    const fields = readFrontMatter("---\ntitle: Mở ca\nscreens: []\ntests:\n  - a.ts\n  - b.ts\n---\n# x\n");
    expect(fields.title).toBe("Mở ca");
    expect(listOf(fields, "screens")).toEqual([]);
    expect(listOf(fields, "tests")).toEqual(["a.ts", "b.ts"]);
    expect(listOf(fields, "decisions")).toEqual([]);
  });

  it("refuses a page without the block, and lines of another shape", () => {
    expect(() => readFrontMatter("# no block\n")).toThrow("does not start");
    expect(() => readFrontMatter("---\ntitle: x\n- stray\n---\n")).toThrow("not a field");
    expect(() => readFrontMatter("---\n  - orphan\n---\n")).toThrow("outside a list");
    expect(() => listOf(readFrontMatter("---\ntests: one\n---\n"), "tests")).toThrow("list");
  });
});
