import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { type HandbookFrontMatter, parseFrontMatter } from "./handbook-front-matter";

export const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
export const HANDBOOK_DIR = join(REPO_ROOT, "docs/handbook");
/** The counter's part of the handbook; written on its own branch, checked once it is here. */
export const COUNTER_PART_DIR = join(HANDBOOK_DIR, "may-quay");
/** Screens and pages left out on purpose, each with its reason, in a table of this file. */
export const NOT_DESCRIBED_FILE = "_khong-mo-ta.md";
/** Files of the handbook that describe no screen: the index, the gaps list, the left-out list. */
const NOT_PAGES = new Set(["README.md", "discrepancies.md", NOT_DESCRIBED_FILE]);

export interface HandbookPage {
  /** Path from the repo root, as problems name it. */
  readonly path: string;
  readonly frontMatter: HandbookFrontMatter;
}

/** Every handbook page under `dir` (the not-described list aside), or why one cannot be read. */
export function readHandbookPages(dir: string): { pages: HandbookPage[]; problems: string[] } {
  const pages: HandbookPage[] = [];
  const problems: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".md") && !NOT_PAGES.has(entry.name)) {
        const path = relative(REPO_ROOT, full);
        const parsed = parseFrontMatter(readFileSync(full, "utf8"));
        if (parsed.ok) pages.push({ path, frontMatter: parsed.value });
        else problems.push(`${path}: ${parsed.reason}`);
      }
    }
  };
  walk(dir);
  return { pages, problems };
}

/** The names in the first column of every `| name | reason |` row of the not-described list. */
export function readNotDescribed(dir: string): Map<string, string> {
  const file = join(dir, NOT_DESCRIBED_FILE);
  const listed = new Map<string, string>();
  if (!existsSync(file)) return listed;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const row = /^\|\s*`([^`]+)`\s*\|\s*(.+?)\s*\|\s*$/.exec(line);
    if (row !== null && row[1] !== undefined && row[2] !== undefined) listed.set(row[1], row[2]);
  }
  return listed;
}

/** The till's screens, read from the list its layout test opens. */
export function readCounterScreens(): string[] {
  const source = readFileSync(
    join(REPO_ROOT, "apps/pos/test/browser/pages/screen-names.ts"),
    "utf8",
  );
  const list = /SCREEN_NAMES\s*=\s*\[([\s\S]*?)\]/.exec(source)?.[1] ?? "";
  return [...list.matchAll(/"([^"]+)"/g)].map((match) => match[1] ?? "");
}

/** The pages of the backoffice's menu, read from ADMIN_SECTIONS. */
export function readMenuPages(): string[] {
  const source = readFileSync(
    join(REPO_ROOT, "apps/backoffice/src/lib/navigation/admin-sections.ts"),
    "utf8",
  );
  const list = /ADMIN_SECTIONS[^=]*=\s*\[([\s\S]*?)\];/.exec(source)?.[1] ?? "";
  return [...list.matchAll(/href:\s*"([^"]+)"/g)].map((match) => match[1] ?? "");
}

/**
 * Every page of the backoffice by its address, read from the app router's page files, so
 * a page reached from another (sign-in, the product editor, the import) is covered too.
 */
export function readRoutedPages(): string[] {
  const appDir = join(REPO_ROOT, "apps/backoffice/src/app");
  const routes: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "page.tsx") {
        const segments = relative(appDir, current)
          .split("/")
          .filter((part) => part !== "" && !part.startsWith("("));
        routes.push(`/${segments.join("/")}`);
      }
    }
  };
  walk(appDir);
  return routes.sort();
}

/** The decision ids of the decision log's table. */
export function readDecisionIds(): Set<string> {
  const source = readFileSync(join(REPO_ROOT, "docs/decision-log.md"), "utf8");
  return new Set([...source.matchAll(/^\|\s*(D-\d{3})\s*\|/gm)].map((match) => match[1] ?? ""));
}

/** The screens or pages no page describes and the not-described list does not excuse. */
export function undescribed(
  names: readonly string[],
  pages: readonly HandbookPage[],
  notDescribed: ReadonlyMap<string, string>,
): string[] {
  const described = new Set(pages.flatMap((page) => page.frontMatter.screens));
  return names.filter((name) => !described.has(name) && !notDescribed.has(name));
}

/** A screen or page claimed by more than one handbook page, which page should own it is unclear. */
export function claimedTwice(names: readonly string[], pages: readonly HandbookPage[]): string[] {
  return names
    .map((name) => ({
      name,
      owners: pages.filter((page) => page.frontMatter.screens.includes(name)),
    }))
    .filter(({ owners }) => owners.length > 1)
    .map(({ name, owners }) => `${name}: ${owners.map((page) => page.path).join(", ")}`);
}

/** Entries in `screens` that are neither a known screen nor a known page (a typo, or a removed screen). */
export function unknownScreens(known: readonly string[], pages: readonly HandbookPage[]): string[] {
  return pages.flatMap((page) =>
    page.frontMatter.screens
      .filter((name) => !known.includes(name))
      .map((name) => `${page.path}: ${name}`),
  );
}

/** `tests` entries pointing at no file, and `decisions` entries the decision log does not have. */
export function brokenReferences(
  pages: readonly HandbookPage[],
  decisionIds: ReadonlySet<string>,
): string[] {
  return pages.flatMap((page) => [
    ...page.frontMatter.tests
      .filter((test) => !existsSync(join(REPO_ROOT, test)))
      .map((test) => `${page.path}: test file ${test} does not exist`),
    ...page.frontMatter.decisions
      .filter((id) => !decisionIds.has(id))
      .map((id) => `${page.path}: decision ${id} is not in docs/decision-log.md`),
  ]);
}

/** Pictures (`![…](path)`) of any handbook file whose file is missing, as `file: path`. */
export function missingPictures(dir: string): string[] {
  const missing: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".md")) {
        for (const match of readFileSync(full, "utf8").matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) {
          const target = match[1] ?? "";
          if (!existsSync(join(dirname(full), target)))
            missing.push(`${relative(REPO_ROOT, full)}: ${target}`);
        }
      }
    }
  };
  walk(dir);
  return missing;
}
