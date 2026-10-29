import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { vi } from "../../src/messages/vi";

let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

describe.each([
  { width: 360, height: 700 },
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
])("the update strip over the selling screen at $width x $height", ({ width, height }) => {
  it("takes its own room above the screen, folded or not, and covers no product", async () => {
    const page = await browser!.newPage({ viewport: { width, height } });
    await page.goto(`${inject("screensOrigin")}/screens.html?screen=update-banner`);
    await page.waitForFunction('document.body.dataset.screenReady === "update-banner"');
    const measure = () =>
      page.evaluate(() => {
        const strip = document.querySelector<HTMLElement>("[data-update-banner]")!.getBoundingClientRect();
        const screen = document.querySelector<HTMLElement>("main.pos-screen")!.getBoundingClientRect();
        const tiles = [...document.querySelectorAll<HTMLElement>(".pos-product-grid *")]
          .map((element) => element.getBoundingClientRect())
          .filter((box) => box.width > 0 && box.height > 0);
        return {
          stripBottom: strip.bottom,
          stripHeight: strip.height,
          screenTop: screen.top,
          screenBottom: screen.bottom,
          sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          coveredTiles: tiles.filter((box) => box.top < strip.bottom && box.bottom > strip.top).length,
          position: getComputedStyle(document.querySelector("[data-update-banner]")!).position,
        };
      });
    const open = await measure();
    expect(open.position).not.toBe("fixed");
    expect(open.stripBottom).toBeLessThanOrEqual(open.screenTop + 0.5);
    expect(open.coveredTiles).toBe(0);
    expect(open.sideways).toBe(0);
    // The screen under it ends where the window ends: the strip took room, it did not push the screen out.
    expect(open.screenBottom).toBeLessThanOrEqual(height + 0.5);

    await page.getByRole("button", { name: vi.update.fold }).click();
    const folded = await measure();
    expect(folded.stripHeight).toBeLessThan(open.stripHeight);
    expect(folded.stripBottom).toBeLessThanOrEqual(folded.screenTop + 0.5);
    expect(folded.coveredTiles).toBe(0);
    expect(await page.locator("[data-update-banner]").innerText()).toContain(vi.update.bannerShort);
    await page.close();
  });
});
