import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Every theme of the till, read from pos-tokens.css as the browser would see it: each pair of
// writing on a fill must stay readable (WCAG 2.2 AA), whichever theme the till is set to.

const CSS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../styles/pos-tokens.css"), "utf8");

interface Declaration {
  readonly value: string;
  readonly note: string | undefined;
}
type Theme = ReadonlyMap<string, Declaration>;

function themesIn(css: string): { selectors: Map<string, string>; themes: Map<string, Theme> } {
  const selectors = new Map<string, string>();
  const themes = new Map<string, Theme>();
  for (const block of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const selector = block[1]!.replace(/\/\*[\s\S]*?\*\//g, "").trim();
    const name = /data-theme="([a-z]+)"/.exec(selector)?.[1];
    if (name === undefined) continue;
    const declarations = new Map<string, Declaration>();
    for (const line of block[2]!.matchAll(/(--[\w-]+|color-scheme):\s*([^;]+);[ \t]*(?:\/\*(.*?)\*\/)?/g)) {
      declarations.set(line[1]!, { value: line[2]!.replace(/\s+/g, " ").trim(), note: line[3] });
    }
    selectors.set(name, selector);
    themes.set(name, declarations);
  }
  return { selectors, themes };
}

const { selectors, themes } = themesIn(CSS);

function colour(theme: Theme, name: string): string {
  const value = theme.get(`--c-${name}`)?.value;
  if (value === undefined) throw new Error(`--c-${name} is not set`);
  const alias = /^var\(--c-([\w-]+)\)$/.exec(value);
  return alias === null ? value : colour(theme, alias[1]!);
}

function luminance(hex: string): number {
  const digits = /^#([0-9a-f]{6})$/i.exec(hex)?.[1];
  if (digits === undefined) throw new Error(`${hex} is not a solid #rrggbb colour`);
  const [r, g, b] = [0, 2, 4].map((at) => {
    const c = Number.parseInt(digits.slice(at, at + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

const contrast = (a: string, b: string) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
};

/** Writing on a fill, as the screens draw it. */
const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ...["text", "text-2", "text-3"].flatMap((ink) =>
    ["bg", "surface", "surface-2", "surface-3"].map((fill) => [ink, fill] as const),
  ),
  ["text", "brand-soft"],
  ["brand", "surface"],
  ["brand", "bg"],
  ["brand-strong", "surface"],
  ["brand-strong", "surface-2"],
  ["brand-strong", "brand-soft"],
  ["brand-strong", "brand-soft-pressed"],
  ["on-brand", "brand"],
  ["on-brand", "brand-strong"],
  ["price", "surface"],
  ["price", "surface-2"],
  ["info", "surface"],
  ["info", "info-soft"],
  ["on-info", "info"],
  ["amber", "surface"],
  ["amber", "amber-soft"],
  ["on-amber", "amber-fill"],
  ["danger", "surface"],
  ["danger", "danger-soft"],
  ["on-danger", "danger"],
  ["success", "surface"],
  ["success", "success-soft"],
  ["violet", "violet-soft"],
  ...Array.from({ length: 9 }, (_, tone) => [`cat-${tone}`, `cat-${tone}-soft`] as const),
];

/** Marks that are not writing but must still be seen: the focus ring, an empty box's edge. */
const MARK_PAIRS: readonly (readonly [string, string])[] = [
  ["focus", "surface"],
  ["focus", "bg"],
  ["control-edge", "surface"],
];

const THEME_NAMES = ["pastel", "rangxay", "dark"];

describe("the till's themes", () => {
  it("are the soft blue (also when no theme is set), the warm café and dark", () => {
    expect([...themes.keys()].sort()).toEqual([...THEME_NAMES].sort());
    expect(selectors.get("pastel")).toMatch(/^:root,/);
    expect(themes.get("dark")!.get("color-scheme")?.value).toBe("dark");
  });

  it("each set every colour, shadow and ring, so none shows another theme's colour", () => {
    const names = (theme: string) => [...themes.get(theme)!.keys()].sort();
    for (const theme of THEME_NAMES) expect(names(theme), theme).toEqual(names("pastel"));
  });

  for (const theme of THEME_NAMES) {
    it(`keep writing readable in ${theme}: every pair at least 4.5:1`, () => {
      const tokens = themes.get(theme)!;
      const low = TEXT_PAIRS.map(([ink, fill]) => ({
        pair: `${ink} on ${fill}`,
        ratio: contrast(colour(tokens, ink), colour(tokens, fill)),
      })).filter(({ ratio }) => ratio < 4.5);
      expect(low).toEqual([]);
    });

    it(`keep the focus ring and an empty box's edge visible in ${theme}: 3:1 or more`, () => {
      const tokens = themes.get(theme)!;
      for (const [mark, fill] of MARK_PAIRS) {
        expect(contrast(colour(tokens, mark), colour(tokens, fill)), `${mark} on ${fill}`).toBeGreaterThanOrEqual(3);
      }
    });

    it(`note the true contrast beside each colour of ${theme}`, () => {
      const tokens = themes.get(theme)!;
      const notes = [...tokens].flatMap(([name, { note }]) =>
        [...(note ?? "").matchAll(/(\d+(?:\.\d)?):1 on ([a-z0-9-]+)/g)].map((match) => ({
          name,
          noted: Number(match[1]),
          fill: match[2]!,
        })),
      );
      expect(notes.length).toBeGreaterThan(40);
      const wrong = notes
        .map(({ name, noted, fill }) => ({
          pair: `${name} on ${fill}`,
          noted,
          actual: Number(contrast(colour(tokens, name.slice(4)), colour(tokens, fill)).toFixed(2)),
        }))
        .filter(({ noted, actual }) => Math.abs(noted - actual) > 0.1);
      expect(wrong).toEqual([]);
    });
  }
});
