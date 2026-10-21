import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HANDBOOK_DIR,
  MAX_PICTURE_BYTES,
  PAGE_SECTIONS,
  brokenLinks,
  brokenReferences,
  claimedTwice,
  readCounterScreens,
  readDecisionIds,
  readHandbookPages,
  readMenuPages,
  readNotDescribed,
  readRoutedPages,
  missingPictures,
  missingSections,
  picturesOverLimit,
  undescribed,
  unknownScreens,
} from "./handbook-coverage";
import { parseFrontMatter } from "./handbook-front-matter";

const { pages, problems } = readHandbookPages(HANDBOOK_DIR);
const notDescribed = readNotDescribed(HANDBOOK_DIR);
const counterScreens = readCounterScreens();
const backofficePages = [...new Set([...readMenuPages(), ...readRoutedPages()])];

/** A throwaway handbook folder with `files` written in it, removed after `check` runs. */
function inFolder(files: Record<string, string | Buffer>, check: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "handbook-"));
  try {
    for (const [name, content] of Object.entries(files)) {
      mkdirSync(join(dir, name, ".."), { recursive: true });
      writeFileSync(join(dir, name), content);
    }
    check(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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

  it("describes every till screen", () => {
    expect(counterScreens.length).toBeGreaterThan(10);
    expect(undescribed(counterScreens, pages, notDescribed)).toEqual([]);
  });

  it("gives each till screen to exactly one handbook page", () => {
    expect(claimedTwice(counterScreens, pages)).toEqual([]);
  });

  it("answers the same questions on every page", () => {
    expect(missingSections(pages)).toEqual([]);
  });

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

  it("shows only pictures whose file is there, each small enough for a phone", () => {
    expect(missingPictures(HANDBOOK_DIR)).toEqual([]);
    expect(picturesOverLimit(HANDBOOK_DIR)).toEqual([]);
  });

  it("links only to files that are there", () => {
    expect(brokenLinks(HANDBOOK_DIR)).toEqual([]);
  });
});

describe("the coverage check itself", () => {
  it("reports a screen no page describes", () => {
    const screens = [...backofficePages, "a-screen-nobody-wrote-about"];
    expect(undescribed(screens, pages, notDescribed)).toEqual(["a-screen-nobody-wrote-about"]);
  });

  it("reports a picture whose file is missing", () => {
    inFolder(
      { "page.md": "![Màn hình](images/not-taken.webp)\n\nVí dụ cú pháp: `![tên](đường dẫn)`\n" },
      (dir) => expect(missingPictures(dir)).toHaveLength(1),
    );
  });

  it("reports a picture too big and a link to a page that is not there", () => {
    inFolder(
      {
        "images/huge.webp": Buffer.alloc(MAX_PICTURE_BYTES + 1),
        "images/small.webp": Buffer.alloc(10),
        "page.md": "[có](images/small.webp) [mất](02-khong-co.md#buoc) [web](https://example.com)\n",
      },
      (dir) => {
        expect(picturesOverLimit(dir)).toHaveLength(1);
        expect(brokenLinks(dir)).toEqual([expect.stringMatching(/page\.md: 02-khong-co\.md#buoc$/)]);
      },
    );
  });

  it("reports a page without a part of the template, the offline one outside operations", () => {
    const page = (path: string, headings: readonly string[]) => ({
      path,
      headings,
      frontMatter: pages[0]!.frontMatter,
    });
    expect(
      missingSections([
        page("docs/handbook/quan-ly/x.md", PAGE_SECTIONS),
        page("docs/handbook/van-hanh/y.md", PAGE_SECTIONS),
      ]),
    ).toEqual(["docs/handbook/quan-ly/x.md: Mất mạng thì sao"]);
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
    const fake = { path: "docs/handbook/fake.md", frontMatter: parsed.value, headings: [] };
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

  it("reads the audience as one name or a list", () => {
    const one = parseFrontMatter("---\ntitle: A\naudience: quan-ly\nscreens: []\ndecisions: []\ntests: []\n---\n");
    const two = parseFrontMatter(
      "---\ntitle: A\naudience:\n  - thu-ngan\n  - pha-che\nscreens: []\ndecisions: []\ntests: []\n---\n",
    );
    expect(one).toMatchObject({ ok: true, value: { audience: ["quan-ly"] } });
    expect(two).toMatchObject({ ok: true, value: { audience: ["thu-ngan", "pha-che"] } });
  });

  it("reads lists written inline, indented or not", () => {
    const parsed = parseFrontMatter(
      '---\ntitle: A\naudience: thu-ngan\nscreens:\n- sale\n  - payment\ndecisions: [D-001, "D-002"]\ntests: []\n---\n',
    );
    expect(parsed).toMatchObject({
      ok: true,
      value: { screens: ["sale", "payment"], decisions: ["D-001", "D-002"], tests: [] },
    });
  });
});
