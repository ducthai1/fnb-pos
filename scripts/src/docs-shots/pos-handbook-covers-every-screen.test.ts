import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type FrontMatter, listOf, readFrontMatter } from "./handbook-front-matter";

// The till's handbook against the code: every screen of the POS described by exactly one
// page (or listed as a test-only screen), and every decision, test, picture and link a page
// names really there, so the handbook cannot quietly drift from what it documents.

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SECTION = join(REPO, "docs/handbook/may-quay");
const TEST_ONLY = "_khong-mo-ta.md";
const AUDIENCES = new Set(["chu-quan", "quan-ly", "thu-ngan", "pha-che", "van-hanh"]);
const SECTIONS = [
  "## Dùng để làm gì",
  "## Ai dùng, cần quyền gì",
  "## Các bước",
  "## Luật và giới hạn",
  "## Khi có lỗi",
  "## Mất mạng thì sao",
  "## Chưa làm / sắp có",
];
const MAX_PICTURE_BYTES = 150 * 1024;

/** The names in the POS layout test's list, read from its source. */
const screenNames = (): string[] => {
  const source = readFileSync(join(REPO, "apps/pos/test/browser/pages/screen-names.ts"), "utf8");
  const list = /SCREEN_NAMES = \[([\s\S]*?)\]/.exec(source)?.[1] ?? "";
  return [...list.matchAll(/"([a-z-]+)"/g)].map((match) => match[1]!);
};

const pages = readdirSync(SECTION)
  .filter((name) => /^\d{2}-[a-z-]+\.md$/.test(name))
  .sort()
  .map((name) => {
    const text = readFileSync(join(SECTION, name), "utf8");
    return { name, text, fields: readFrontMatter(text) as FrontMatter };
  });
const decisionLog = readFileSync(join(REPO, "docs/decision-log.md"), "utf8");

describe("the till's handbook", () => {
  it("has the ten pages of the till", () => {
    expect(pages.map((page) => page.name.slice(0, 2))).toEqual(
      ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"],
    );
  });

  it("describes every screen of the POS on exactly one page, or says why not", () => {
    const testOnly = listOf(readFrontMatter(readFileSync(join(SECTION, TEST_ONLY), "utf8")), "screens");
    const described = [...pages.flatMap((page) => listOf(page.fields, "screens")), ...testOnly];
    expect([...described].sort()).toEqual(screenNames().sort());
  });

  it.each(pages.map((page) => [page.name, page] as const))("%s has its block and sections", (_, page) => {
    expect(typeof page.fields.title === "string" && page.fields.title.length > 0).toBe(true);
    const audience = listOf(page.fields, "audience");
    expect(audience.length).toBeGreaterThan(0);
    for (const who of audience) expect(AUDIENCES.has(who), who).toBe(true);
    for (const heading of SECTIONS) expect(page.text, heading).toContain(`\n${heading}\n`);
  });

  it.each(pages.map((page) => [page.name, page] as const))("%s names decisions and tests that exist", (_, page) => {
    for (const decision of listOf(page.fields, "decisions")) {
      expect(decision).toMatch(/^D-\d{3}$/);
      expect(decisionLog, decision).toContain(`| ${decision} |`);
    }
    const tests = listOf(page.fields, "tests");
    expect(tests.length).toBeGreaterThan(0);
    for (const test of tests) expect(existsSync(join(REPO, test)), test).toBe(true);
  });

  it.each(pages.map((page) => [page.name, page] as const))("%s links pictures and pages that exist", (_, page) => {
    for (const [, target] of page.text.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
      if (/^https?:/.test(target!)) continue;
      const path = join(SECTION, target!);
      expect(existsSync(path), target).toBe(true);
      if (path.endsWith(".webp")) expect(statSync(path).size, target).toBeLessThanOrEqual(MAX_PICTURE_BYTES);
    }
  });
});
