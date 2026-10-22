import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

/** How many columns of products the selling screen draws, and how wide one tile is. */
async function gridAt(width: number, height: number) {
  const page = await browser!.newPage({ viewport: { width, height } });
  await page.goto(`${inject("screensOrigin")}/screens.html?screen=sale`);
  await page.waitForFunction(`document.body.dataset.screenReady === "sale"`);
  const grid = await page.$eval(".pos-product-grid", (element) => ({
    columns: getComputedStyle(element).gridTemplateColumns.split(" ").length,
    tile: element.querySelector(".pos-product")!.getBoundingClientRect().width,
    orderShown: document.querySelector(".pos-cart")!.getBoundingClientRect().width > 0,
  }));
  await page.close();
  return grid;
}

// Small cards so a till sees much of its menu at once beside the open order: five columns
// on a 1280 till, about seven on a 1920 one, still a thumb's width on a small tablet.
describe("the product grid beside the open order", () => {
  it.each([
    [1920, 1080, 7],
    [1280, 800, 5],
    [1024, 768, 3],
    [800, 1280, 2],
    [360, 740, 2],
  ])("at %ix%i shows %i columns of tiles at least 120px wide", async (width, height, columns) => {
    const grid = await gridAt(width, height);
    expect(grid.orderShown).toBe(true);
    expect(grid.columns).toBe(columns);
    expect(grid.tile).toBeGreaterThanOrEqual(120);
  });
});
