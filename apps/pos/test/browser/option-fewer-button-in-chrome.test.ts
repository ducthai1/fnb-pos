import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, expect, inject, it } from "vitest";

let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

// A multi-pick group draws a tick box where each chip's icon is; the "one fewer" button of an
// option taken twice sits beside the chip and its minus must stay a minus, not an empty box.
it("draws the minus of an option taken more than once, not an empty tick box", async () => {
  const page = await browser!.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${inject("screensOrigin")}/screens.html?screen=modifier-picker`);
  await page.waitForFunction(`document.body.dataset.screenReady === "modifier-picker"`);
  await page.locator('.pos-chips[data-multi="true"] .pos-chip').last().click();
  const fewer = page.locator(".pos-chip--fewer").first();
  await fewer.waitFor();
  const icon = await fewer.evaluate((button) => {
    const svg = button.querySelector(".pos-icon")!;
    const style = getComputedStyle(svg);
    return { color: style.color, border: style.borderTopWidth };
  });
  expect(icon.color).not.toBe("rgba(0, 0, 0, 0)");
  expect(icon.border).toBe("0px");
  await page.close();
});
