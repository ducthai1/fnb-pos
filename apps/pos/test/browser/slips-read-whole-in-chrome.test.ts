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

/** Every screen that shows a printed slip's preview: bill, kitchen, cup, void, refund, shift close. */
const SLIP_SCREENS: readonly ScreenName[] = ["sale-done", "table-slips", "refund-and-close-slips"];
const WIDTHS = [
  { width: 360, height: 740 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
] as const;

describe.each(SLIP_SCREENS)("the slips of %s", (screen) => {
  it.each(WIDTHS)("show every column of the paper, none cut off, at $width px", async (viewport) => {
    const page = await browser!.newPage({ viewport });
    await page.goto(`${inject("screensOrigin")}/screens.html?screen=${screen}`);
    await page.waitForFunction(`document.body.dataset.screenReady === "${screen}"`);
    const previews = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".pos-slip__preview")].map((slip) => {
        const card = slip.closest<HTMLElement>(".pos-slip")!.getBoundingClientRect();
        const paper = slip.getBoundingClientRect();
        return {
          // Text wider than the paper scrolls inside it: the right-hand columns are out of sight.
          hidden: slip.scrollWidth - slip.clientWidth,
          // The paper sits inside its card, and the type stays big enough to read.
          outside: Math.max(0, paper.right - card.right, card.left - paper.left),
          fontPx: Number.parseFloat(getComputedStyle(slip).fontSize),
        };
      }),
    );
    await page.close();
    expect(previews.length).toBeGreaterThan(0);
    for (const slip of previews) {
      expect(slip.hidden, "columns hidden by a sideways scroll").toBeLessThanOrEqual(1);
      expect(slip.outside, "paper sticking out of its card").toBeLessThanOrEqual(1);
      expect(slip.fontPx, "type size").toBeGreaterThanOrEqual(8);
    }
  });
});
