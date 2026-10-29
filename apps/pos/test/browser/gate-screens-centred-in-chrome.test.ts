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

const GATES: readonly ScreenName[] = ["pairing", "staff-picker", "staff-picker-crowd", "pin-entry", "crash", "blocked"];
// A till held sideways at its usual sizes, and held upright.
const SIZES = [
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 768, height: 1024 },
  { width: 1080, height: 1920 },
] as const;

describe.each(SIZES)("a gate on a $width x $height screen", ({ width, height }) => {
  it.each(GATES)("%s is a card in the middle with nothing cut off", async (name) => {
    const page = await browser!.newPage({ viewport: { width, height } });
    await page.goto(`${inject("screensOrigin")}/screens.html?screen=${name}`);
    await page.waitForFunction(`document.body.dataset.screenReady === "${name}"`);
    const m = await page.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>("[data-scroll-root]")!;
      const edge = scroller.getBoundingClientRect();
      const card = document.querySelector<HTMLElement>(".pos-gate")!.getBoundingClientRect();
      const list = document.querySelector<HTMLElement>(".pos-gate__scroll");
      return {
        top: card.top - edge.top,
        bottom: edge.bottom - card.bottom,
        left: card.left - edge.left,
        right: edge.right - card.right,
        scrolls: scroller.scrollHeight > scroller.clientHeight + 1,
        sideways: scroller.scrollWidth - scroller.clientWidth,
        listCut: list === null ? 0 : Math.max(0, list.scrollHeight - list.clientHeight),
      };
    });
    await page.close();
    expect(m.sideways).toBe(0);
    expect(Math.abs(m.left - m.right)).toBeLessThanOrEqual(1);
    // Room to spare: the same space above and below, never stuck to the top with the rest empty.
    if (!m.scrolls) expect(Math.abs(m.top - m.bottom)).toBeLessThanOrEqual(1);
    if (!m.scrolls) expect(m.top).toBeGreaterThanOrEqual(0);
    // A crowd of names scrolls inside its card instead of growing it past the screen.
    if (name === "staff-picker-crowd") expect(m.listCut).toBeGreaterThan(0);
  });
});
