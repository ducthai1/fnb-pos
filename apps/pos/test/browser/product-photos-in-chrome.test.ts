import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

async function openScreen(name: string, width: number): Promise<Page> {
  const page = await browser!.newPage({ viewport: { width, height: 640 } });
  await page.goto(`${inject("screensOrigin")}/screens.html?screen=${name}`);
  await page.waitForFunction(`document.body.dataset.screenReady === "${name}"`);
  await page.waitForFunction(`document.querySelectorAll('[data-photo="loading"]').length === 0`);
  return page;
}

/** Every mark with a photo: how it stands, and the box its image is drawn in. */
const marksOf = (page: Page) =>
  page.$$eval("[data-photo]", (marks) =>
    marks.map((mark) => {
      const image = mark.querySelector("img");
      const box = mark.getBoundingClientRect();
      return {
        state: (mark as HTMLElement).dataset.photo,
        initial: (mark as HTMLElement).dataset.initial,
        drawn: image === null ? null : image.complete && image.naturalWidth > 0,
        markRatio: box.height === 0 ? 0 : box.width / box.height,
        imageFits:
          image === null ||
          (Math.abs(image.getBoundingClientRect().width - box.width) < 1 &&
            Math.abs(image.getBoundingClientRect().height - box.height) < 1),
      };
    }),
  );

describe.each([360, 800, 1280])("product photos at %ipx wide", (width) => {
  it("crops a very tall and a very wide photo to the same 4:3 frame on the tiles", async () => {
    const page = await openScreen("sale-photos", width);
    const tiles = (await marksOf(page)).filter((mark) => mark.markRatio > 1);
    await page.close();
    const shown = tiles.filter((mark) => mark.state === "shown");
    expect(shown).toHaveLength(2);
    for (const mark of shown) {
      expect(mark).toMatchObject({ drawn: true, imageFits: true });
      expect(mark.markRatio).toBeCloseTo(4 / 3, 1);
    }
    // Every other band takes the same frame, so rows stay even.
    for (const mark of tiles) expect(mark.markRatio).toBeCloseTo(4 / 3, 1);
  });

  it("draws the initials where a photo is gone, on the tile and on the cart line", async () => {
    const page = await openScreen("sale-photos", width);
    const failed = (await marksOf(page)).filter((mark) => mark.state === "failed");
    const brokenImages = await page.$$eval(
      "img",
      (images) => images.filter((image) => image.complete && image.naturalWidth === 0).length,
    );
    await page.close();
    expect(failed.length).toBeGreaterThanOrEqual(2);
    for (const mark of failed) expect(mark).toMatchObject({ drawn: null, initial: "CP" });
    expect(brokenImages).toBe(0);
  });

  it("shows the photo at the head of the option screen", async () => {
    const page = await openScreen("modifier-picker-photo", width);
    const marks = await marksOf(page);
    await page.close();
    expect(marks).toEqual([
      expect.objectContaining({ state: "shown", drawn: true, imageFits: true }),
    ]);
  });
});
