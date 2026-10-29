import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { ScreenName } from "./pages/screen-names";

let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

const WIDTH = 2560;
// The gutter token at this width: clamp(16px, 4vw - 48px, 64px).
const GUTTER = Math.min(64, Math.max(16, 0.04 * WIDTH - 48));

interface Box {
  name: string;
  left: number;
  right: number;
}

/** The screen's content blocks, as gaps from the left and right edge of the screen's scroller. */
async function contentGaps(page: Page, name: ScreenName, selector: string): Promise<Box[]> {
  await page.goto(`${inject("screensOrigin")}/screens.html?screen=${name}`);
  await page.waitForFunction(`document.body.dataset.screenReady === "${name}"`);
  return page.evaluate((selector) => {
    const scroller = document.querySelector<HTMLElement>("[data-scroll-root]")!;
    const edge = scroller.getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>(selector)]
      .filter((element) => getComputedStyle(element).position !== "absolute")
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => {
        const box = element.getBoundingClientRect();
        return {
          name: `${element.tagName.toLowerCase()}.${element.className}`,
          left: box.left - edge.left,
          right: edge.left + scroller.clientWidth - box.right,
        };
      });
  }, selector);
}

describe(`the till on a ${WIDTH}px screen`, () => {
  it("spreads a list screen over the whole width, between equal gutters", async () => {
    const page = await browser!.newPage({ viewport: { width: WIDTH, height: 1440 } });
    const blocks = await contentGaps(
      page,
      "order-history",
      ".pos-screen__inner > :not(.pos-topbar)",
    );
    await page.close();
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(Math.abs(block.left - GUTTER), block.name).toBeLessThanOrEqual(1);
      expect(Math.abs(block.right - GUTTER), block.name).toBeLessThanOrEqual(1);
    }
  });

  it("keeps a sign-in card in the middle, not against the left", async () => {
    const page = await browser!.newPage({ viewport: { width: WIDTH, height: 1440 } });
    const [card] = await contentGaps(page, "pin-entry", ".pos-gate");
    await page.close();
    expect(card).toBeDefined();
    expect(Math.abs(card!.left - card!.right)).toBeLessThanOrEqual(1);
    expect(card!.left).toBeGreaterThan(WIDTH / 3);
  });
});
