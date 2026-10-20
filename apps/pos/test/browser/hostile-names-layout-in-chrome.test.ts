import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { HOSTILE_NAMES } from "../../src/test-support/hostile-names";
import { SCREEN_NAMES } from "./pages/screen-names";

let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

interface Overflow {
  /** How far the screen's own scroller is wider than itself; 0 when nothing sticks out. */
  scrollerExcess: number;
  pageExcess: number;
  /** Elements whose box reaches past the scroller's left or right edge. */
  outside: string[];
  text: string;
}

// Measured on the element that scrolls (ScreenFrame), not on the document: the POS never
// lets the page scroll, so the document would stay its width while the screen overflows.
const measure = (page: Page): Promise<Overflow> =>
  page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>("[data-scroll-root]");
    if (scroller === null) throw new Error("no [data-scroll-root] on the screen");
    const edge = scroller.getBoundingClientRect();
    const outside = [...scroller.querySelectorAll<HTMLElement>("*")]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && (box.right > edge.right + 0.5 || box.left < edge.left - 0.5);
      })
      .map((element) => `${element.tagName.toLowerCase()}.${element.className}`);
    const html = document.documentElement;
    return {
      scrollerExcess: scroller.scrollWidth - scroller.clientWidth,
      pageExcess: html.scrollWidth - html.clientWidth,
      outside,
      text: scroller.innerText,
    };
  });

describe.each([360, 800])("the POS screens at %ipx wide with hostile names", (width) => {
  it.each(SCREEN_NAMES)("%s stays within the screen", async (name) => {
    const page = await browser!.newPage({ viewport: { width, height: 640 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${inject("screensOrigin")}/screens.html?screen=${name}`);
    await page.waitForFunction(`document.body.dataset.screenReady === "${name}"`);
    const overflow = await measure(page);
    await page.close();
    expect(errors).toEqual([]);
    expect(overflow).toMatchObject({ scrollerExcess: 0, pageExcess: 0, outside: [] });
    if (["staff-picker", "pin-entry", "sales-home"].includes(name)) {
      // The long name is really on screen, so the test is measuring the hard case.
      expect(overflow.text).toContain(HOSTILE_NAMES.staff);
    }
  });
});
