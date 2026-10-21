import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COUNTER_PART_DIR,
  HANDBOOK_DIR,
  brokenReferences,
  claimedTwice,
  readCounterScreens,
  readDecisionIds,
  readHandbookPages,
  readMenuPages,
  readNotDescribed,
  readRoutedPages,
  undescribed,
  unknownScreens,
} from "./handbook-coverage";
import { parseFrontMatter } from "./handbook-front-matter";

const { pages, problems } = readHandbookPages(HANDBOOK_DIR);
const notDescribed = readNotDescribed(HANDBOOK_DIR);
const counterScreens = readCounterScreens();
const backofficePages = [...new Set([...readMenuPages(), ...readRoutedPages()])];
const counterPartWritten = existsSync(COUNTER_PART_DIR);
if (!counterPartWritten) {
  console.warn(
    "handbook: docs/handbook/may-quay/ is not here yet (the till part is written on its own branch), " +
      "so the till screens are not checked; every other check runs.",
  );
}

describe("the handbook covers the product", () => {
  it("reads the front matter of every page", () => {
    expect(problems).toEqual([]);
    expect(pages.length).toBeGreaterThan(0);
  });

  it("describes every backoffice page, the menu's and the ones reached from them", () => {
    expect(readMenuPages().length).toBeGreaterThan(5);
    expect(undescribed(backofficePages, pages, notDescribed)).toEqual([]);
  });

  it("gives each backoffice page to exactly one handbook page", () => {
    expect(claimedTwice(backofficePages, pages)).toEqual([]);
  });

  it.skipIf(!counterPartWritten)(
    "describes every till screen (skipped while docs/handbook/may-quay/ is missing)",
    () => {
      expect(counterScreens.length).toBeGreaterThan(10);
      expect(undescribed(counterScreens, pages, notDescribed)).toEqual([]);
    },
  );

  it("names only screens and pages that exist", () => {
    expect(unknownScreens([...counterScreens, ...backofficePages], pages)).toEqual([]);
    expect(
      [...notDescribed.keys()].filter(
        (name) => ![...counterScreens, ...backofficePages].includes(name),
      ),
    ).toEqual([]);
  });

  it("points only at test files that exist and decisions the log has", () => {
    expect(brokenReferences(pages, readDecisionIds())).toEqual([]);
  });
});

describe("the coverage check itself", () => {
  it("reports a screen no page describes", () => {
    const screens = [...backofficePages, "a-screen-nobody-wrote-about"];
    expect(undescribed(screens, pages, notDescribed)).toEqual(["a-screen-nobody-wrote-about"]);
  });

  it("lets the not-described list excuse a screen", () => {
    const excused = new Map([["a-screen-nobody-wrote-about", "only shown to support"]]);
    expect(undescribed(["a-screen-nobody-wrote-about"], pages, excused)).toEqual([]);
  });

  it("reports a missing test file, an unknown decision and a page claimed twice", () => {
    const parsed = parseFrontMatter(
      [
        "---",
        "title: Thử",
        "audience: quan-ly",
        "screens: [/settings]",
        "decisions:",
        "  - D-999",
        "tests:",
        "  - nowhere/missing.test.ts",
        "---",
      ].join("\n"),
    );
    if (!parsed.ok) throw new Error(parsed.reason);
    const fake = { path: "docs/handbook/fake.md", frontMatter: parsed.value };
    expect(brokenReferences([fake], new Set(["D-001"]))).toEqual([
      "docs/handbook/fake.md: test file nowhere/missing.test.ts does not exist",
      "docs/handbook/fake.md: decision D-999 is not in docs/decision-log.md",
    ]);
    expect(claimedTwice(["/settings"], [...pages, fake])).toHaveLength(1);
  });

  it("refuses front matter without its lists or with an unknown audience", () => {
    expect(parseFrontMatter("---\ntitle: A\naudience: quan-ly\nscreens: []\n---\n")).toMatchObject({
      ok: false,
    });
    expect(
      parseFrontMatter(
        "---\ntitle: A\naudience: khach\nscreens: []\ndecisions: []\ntests: []\n---\n",
      ),
    ).toMatchObject({
      ok: false,
    });
    expect(parseFrontMatter("# no front matter")).toMatchObject({ ok: false });
  });
});
