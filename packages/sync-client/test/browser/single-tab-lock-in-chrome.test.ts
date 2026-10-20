import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { BROWSER_STORE_ERROR_CODES } from "../../src/browser/browser-store-errors";
import type { SingleTabOutcome } from "./browser-page-results";
import { launchSystemChrome } from "./support/system-chrome";

let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

const url = () => `${inject("browserPagesOrigin")}/single-tab.html`;

async function outcomeOf(page: Page): Promise<SingleTabOutcome> {
  await page.waitForFunction("window.__singleTab !== undefined", undefined, { timeout: 30_000 });
  return (await page.evaluate("window.__singleTab")) as SingleTabOutcome;
}

it("turns a second tab away with a code the POS can explain, and opens there once the first closes", async () => {
  const context = await browser!.newContext();
  const first = await context.newPage();
  await first.goto(url());
  expect(await outcomeOf(first)).toEqual({ opened: true, pending: 1 });

  const second = await context.newPage();
  await second.goto(url());
  expect(await outcomeOf(second)).toMatchObject({
    opened: false,
    code: BROWSER_STORE_ERROR_CODES.openInAnotherTab,
  });

  await first.close();
  // The lock and the file handles go with the first tab's Worker, a moment after it closes.
  let reopened: SingleTabOutcome = { opened: false, code: null, message: "not tried" };
  for (let attempt = 0; attempt < 20 && !reopened.opened; attempt += 1) {
    await second.reload();
    reopened = await outcomeOf(second);
    if (!reopened.opened) await second.waitForTimeout(250);
  }
  // The first tab's sale is still there: the database lives in OPFS, not in the tab.
  expect(reopened).toEqual({ opened: true, pending: 2 });
  await context.close();
});
