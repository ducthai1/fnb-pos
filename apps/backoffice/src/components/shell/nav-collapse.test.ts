import { afterEach, describe, expect, it } from "vitest";
import { rememberCollapse, rememberedCollapse } from "./nav-collapse";

const screenOf = (width: number) => {
  window.matchMedia = ((query: string) => {
    const min = Number(/min-width: (\d+)px/.exec(query)?.[1] ?? 0);
    const max = Number(/max-width: (\d+)px/.exec(query)?.[1] ?? Infinity);
    return { matches: width >= min && width <= max } as MediaQueryList;
  }) as typeof window.matchMedia;
};

afterEach(() => {
  window.localStorage.clear();
  Reflect.deleteProperty(window, "matchMedia");
});

describe("where the side menu starts", () => {
  it("starts on its icons between a phone and a computer, wide elsewhere, when never chosen", () => {
    for (const [width, narrowed] of [
      [360, false],
      [800, true],
      [1024, true],
      [1280, false],
    ] as const) {
      screenOf(width);
      expect(rememberedCollapse(), `${width}px`).toBe(narrowed);
    }
  });

  it("keeps what this browser chose last, whatever the screen", () => {
    screenOf(800);
    rememberCollapse(false);
    expect(rememberedCollapse()).toBe(false);
    screenOf(1280);
    rememberCollapse(true);
    expect(rememberedCollapse()).toBe(true);
  });
});
