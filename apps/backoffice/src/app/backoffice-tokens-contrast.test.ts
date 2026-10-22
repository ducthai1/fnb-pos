// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THEME_CHOICES, type Theme } from "../lib/theme/theme-choice";

// Reads the token file as the browser gets it and holds every documented pair of writing on
// its fill to WCAG 2.2 AA (4.5:1) in every look, and the edges that are a control's only
// outline (the focus ring, an empty tick box) to 3:1.

const CSS = readFileSync(new URL("./backoffice-tokens.css", import.meta.url), "utf8");
const THEMES = THEME_CHOICES.filter((choice): choice is Theme => choice !== "system");

/** The `--c-*` colours written as #rrggbb in the block of `[data-theme="<theme>"]`. */
function coloursOf(theme: Theme): Map<string, string> {
  const at = CSS.indexOf(`:root[data-theme="${theme}"]`);
  if (at < 0) throw new Error(`no block for ${theme}`);
  const open = CSS.indexOf("{", at);
  const block = CSS.slice(open + 1, CSS.indexOf("}", open));
  return new Map([...block.matchAll(/--c-([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1]!, m[2]!.toLowerCase()]));
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const SURFACES = ["bg", "surface", "surface-2", "surface-3"];
/** [writing, fill]: every pair the pages put text on, as the token file's notes name them. */
const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ...["text", "text-2", "text-3"].flatMap((ink) => SURFACES.map((fill) => [ink, fill] as const)),
  ["text", "hover"],
  ["text", "head-soft"],
  ["text-inverse", "text"],
  ["on-brand", "brand"],
  ["on-brand", "brand-strong"],
  ["brand", "surface"],
  ["brand", "bg"],
  ["brand-strong", "surface"],
  ["brand-strong", "brand-soft"],
  ["on-pick", "pick-soft"],
  ["on-hero", "hero-from"],
  ["on-hero", "hero-to"],
  ["price", "surface"],
  ["info", "surface"],
  ["info", "info-soft"],
  ["on-info", "info"],
  ["on-info-tool", "info"],
  ["amber", "surface"],
  ["amber", "amber-soft"],
  ["on-amber", "amber-fill"],
  ["danger", "surface"],
  ["danger", "danger-soft"],
  ["on-danger", "danger"],
  ["on-danger", "danger-strong"],
  ["success", "surface"],
  ["success", "success-soft"],
];
const EDGE_PAIRS: readonly (readonly [string, string])[] = [
  ["focus", "surface"],
  ["focus", "bg"],
  ["control-edge", "surface"],
];

describe("the colour tokens of every look", () => {
  it("has a block for each look, the default one also on plain :root", () => {
    expect(CSS).toMatch(/:root,\s*:root\[data-theme="pastel"\]\s*\{/);
    for (const theme of THEMES) expect(coloursOf(theme).size).toBeGreaterThan(30);
  });

  it("names the same colours in every look, so none falls back to the default's", () => {
    const names = (theme: Theme) => [...coloursOf(theme).keys()].sort();
    for (const theme of THEMES) expect(names(theme), theme).toEqual(names("pastel"));
  });

  it.each(THEMES)("keeps writing at 4.5:1 or more on its fill in %s", (theme) => {
    const colours = coloursOf(theme);
    const weak = TEXT_PAIRS.map(([ink, fill]) => ({ ink, fill, ratio: contrast(colours.get(ink)!, colours.get(fill)!) }))
      .filter(({ ratio }) => !(ratio >= 4.5))
      .map(({ ink, fill, ratio }) => `${ink} on ${fill} ${ratio.toFixed(2)}:1`);
    expect(weak).toEqual([]);
  });

  it.each(THEMES)("keeps a control's only outline at 3:1 or more in %s", (theme) => {
    const colours = coloursOf(theme);
    for (const [edge, fill] of EDGE_PAIRS) {
      expect(contrast(colours.get(edge)!, colours.get(fill)!), `${edge} on ${fill}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("leaves no colour written by hand in a screen's CSS, so every look reaches every page", () => {
    const here = new URL("./", import.meta.url);
    const literal = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(|\b(?:white|black)\b/i;
    const written = readdirSync(here)
      .filter((file) => file.endsWith(".css") && file !== "backoffice-tokens.css")
      .flatMap((file) =>
        readFileSync(new URL(file, here), "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
          .split("\n")
          .flatMap((line, at) => (literal.test(line.replace(/white-space/g, "")) ? [`${file}:${at + 1} ${line.trim()}`] : [])),
      );
    expect(written).toEqual([]);
  });

  it("measures the way WCAG does: the pastel grey once tried for small print fails on surface-3", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#5f6f85", coloursOf("pastel").get("surface-3")!)).toBeLessThan(4.5);
  });
});
