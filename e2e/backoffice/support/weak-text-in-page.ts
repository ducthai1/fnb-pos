import type { Page } from "playwright-core";

/** A piece of writing drawn below the WCAG AA contrast on the fill under it. */
export interface WeakText {
  readonly text: string;
  readonly color: string;
  readonly background: string;
  readonly ratio: number;
}

/**
 * Every visible piece of writing on the page whose colour, against the fill it actually
 * stands on (the first solid background up its ancestors, with the see-through ones laid
 * over it), is under 4.5:1, or under 3:1 for large text. Writing over a picture or a
 * gradient, and a control dimmed because it is disabled, are not judged.
 */
// Runs as a string in the page: a bundler's helpers (esbuild's __name) would not exist there.
const SCAN = String.raw`(() => {
    const parse = (value) => {
      const srgb = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/.exec(value);
      if (srgb) return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255, Number(srgb[4] ?? 1)];
      const rgb = /rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\)/.exec(value);
      if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), Number(rgb[4] ?? 1)];
      return null;
    };
    const over = (top, under) => [
      top[0] * top[3] + under[0] * (1 - top[3]),
      top[1] * top[3] + under[1] * (1 - top[3]),
      top[2] * top[3] + under[2] * (1 - top[3]),
      1,
    ];
    const luminance = ([r, g, b]) => {
      const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const ratio = (a, b) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    /** The fill under the element, or null where a picture or a gradient is part of it. */
    const fillUnder = (element) => {
      const layers = [];
      for (let at = element; at !== null; at = at.parentElement) {
        const style = getComputedStyle(at);
        if (style.backgroundImage !== "none") return null;
        const colour = parse(style.backgroundColor);
        if (colour && colour[3] > 0) {
          layers.push(colour);
          if (colour[3] >= 1) break;
        }
      }
      let fill = [255, 255, 255, 1];
      for (const layer of layers.reverse()) fill = over(layer, fill);
      return fill;
    };
    const dimmed = (element) => {
      for (let at = element; at !== null; at = at.parentElement) {
        if (Number(getComputedStyle(at).opacity) < 1) return true;
        if (at.matches(":disabled")) return true;
      }
      return false;
    };
    const weak = [];
    for (const element of document.body.querySelectorAll("*")) {
      const own = [...element.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? "")
        .join("")
        .trim();
      if (own === "") continue;
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (box.width <= 1 || box.height <= 1 || style.visibility !== "visible" || dimmed(element)) continue;
      const ink = parse(style.color);
      const fill = fillUnder(element);
      if (ink === null || fill === null) continue;
      const size = Number.parseFloat(style.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
      const measured = ratio(over(ink, fill), fill);
      if (measured < (large ? 3 : 4.5)) {
        weak.push({
          text: own.slice(0, 40),
          color: style.color,
          background: "rgb(" + fill.slice(0, 3).map(Math.round).join(" ") + ")",
          ratio: Math.round(measured * 100) / 100,
        });
      }
    }
    return weak;
})()`;

export function weakTextOnPage(page: Page): Promise<WeakText[]> {
  return page.evaluate(SCAN) as Promise<WeakText[]>;
}
