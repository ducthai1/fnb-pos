import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { HOSTILE_NAMES } from "../../src/test-support/hostile-names";
import { SCREEN_NAMES } from "./pages/screen-names";
import { measureScreenOverflow } from "./support/measure-screen-overflow";

let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

describe.each([360, 800])("the POS screens at %ipx wide with hostile names", (width) => {
  it.each(SCREEN_NAMES)("%s stays within the screen", async (name) => {
    const page = await browser!.newPage({ viewport: { width, height: 640 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${inject("screensOrigin")}/screens.html?screen=${name}`);
    await page.waitForFunction(`document.body.dataset.screenReady === "${name}"`);
    const overflow = await measureScreenOverflow(page);
    await page.close();
    expect(errors).toEqual([]);
    expect(overflow).toMatchObject({ scrollerExcess: 0, pageExcess: 0, outside: [] });
    if (["staff-picker", "pin-entry", "sales-home"].includes(name)) {
      // The long name is really on screen, so the test is measuring the hard case.
      expect(overflow.text).toContain(HOSTILE_NAMES.staff);
    }
  });
});
