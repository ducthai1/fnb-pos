import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { ScreenName } from "./pages/screen-names";

let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

/** The screens that show printed slips: the bill, kitchen and cup slips, refund and close-shift. */
const SLIP_SCREENS: readonly ScreenName[] = ["sale-done", "table-slips", "refund-and-close-slips"];

interface Paint {
  /** Relative luminance (WCAG) of the fill and the writing, 0 black to 1 white. */
  paper: number;
  ink: number;
  /** The card the slip sits on, to show the theme is really drawn. */
  card: number;
}

describe.each(SLIP_SCREENS)("the slips of %s in the dark theme", (screen) => {
  it("look like white thermal paper with dark ink", async () => {
    const page = await browser!.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${inject("screensOrigin")}/screens.html?screen=${screen}`);
    await page.waitForFunction(`document.body.dataset.screenReady === "${screen}"`);
    const paints = await page.evaluate(() => {
      document.documentElement.dataset.theme = "dark";
      const luminance = (css: string) => {
        const [r, g, b] = css.match(/[\d.]+/g)!.slice(0, 3).map((part) => {
          const c = Number(part) / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
      };
      return [...document.querySelectorAll<HTMLElement>(".pos-slip__preview")].map((slip) => ({
        paper: luminance(getComputedStyle(slip).backgroundColor),
        ink: luminance(getComputedStyle(slip).color),
        card: luminance(getComputedStyle(slip.closest(".pos-slip")!).backgroundColor),
      }));
    });
    await page.close();
    expect(paints.length).toBeGreaterThan(0);
    for (const paint of paints as Paint[]) {
      expect(paint.card, "the dark theme is drawn around the slip").toBeLessThan(0.1);
      expect(paint.paper, "light paper").toBeGreaterThan(0.85);
      expect(paint.ink, "dark ink").toBeLessThan(0.05);
      expect((paint.paper + 0.05) / (paint.ink + 0.05), "ink on paper").toBeGreaterThanOrEqual(4.5);
    }
  });
});
