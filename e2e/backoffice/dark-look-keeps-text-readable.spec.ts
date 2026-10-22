import { vi as text } from "@fnb/backoffice/messages/vi";
import { THEME_KEY } from "@fnb/backoffice/theme/theme-choice";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { signedInBackoffice, unexpectedProblems } from "./support/backoffice-in-browser";
import { weakTextOnPage } from "./support/weak-text-in-page";

const stack = inject("backofficeStack");
const T = text.shell.theme;
let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.getByText(text.shell.loading).first().waitFor({ state: "hidden" }).catch(() => undefined);
}

async function choose(page: Page, look: string) {
  await page.getByRole("combobox", { name: T.label, exact: true }).click();
  await page.getByRole("option", { name: look, exact: true }).click();
}

const lookOf = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme);

it("draws the default soft blue first, then the dark look from the first paint once chosen, every word readable", async () => {
  const { page, problems, close } = await signedInBackoffice(browser!, stack);
  try {
    expect(await lookOf(page)).toBe("pastel");
    await choose(page, T.choices.dark);
    expect(await lookOf(page)).toBe("dark");
    expect(await page.evaluate((key) => localStorage.getItem(key), THEME_KEY)).toBe("dark");

    // The look as the body first appears on the next load: set before anything is drawn.
    // An init script runs before the document has its <html>, so it watches the document.
    await page.addInitScript(() => {
      new MutationObserver((_records, observer) => {
        if (document.body === null) return;
        (window as unknown as { lookAtFirstBody: string | undefined }).lookAtFirstBody = document.documentElement.dataset.theme;
        observer.disconnect();
      }).observe(document, { childList: true, subtree: true });
    });
    for (const path of ["/", "/menu"]) {
      await page.goto(`${stack.backofficeOrigin}${path}`);
      await settle(page);
      expect(await page.evaluate(() => (window as unknown as { lookAtFirstBody: string }).lookAtFirstBody), path).toBe("dark");
      expect(await page.evaluate(() => getComputedStyle(document.body).colorScheme), path).toBe("dark");
      expect(await weakTextOnPage(page), path).toEqual([]);
    }
    // The measure sees weak writing when there is some: grey words on grey are reported.
    await page.evaluate(() => {
      const probe = document.createElement("p");
      probe.textContent = "chữ mờ";
      probe.style.cssText = "position:fixed;top:0;left:0;color:#777;background:#888";
      document.body.append(probe);
    });
    expect((await weakTextOnPage(page)).map((weak) => weak.text)).toEqual(["chữ mờ"]);
    expect(unexpectedProblems(problems)).toEqual([]);
  } finally {
    await close();
  }
});

it("on Theo máy follows the system as it turns dark and light, without a reload", async () => {
  const { page, close } = await signedInBackoffice(browser!, stack);
  try {
    await page.emulateMedia({ colorScheme: "dark" });
    await choose(page, T.choices.system);
    expect(await lookOf(page)).toBe("dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(() => lookOf(page)).toBe("pastel");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => lookOf(page)).toBe("dark");
    await choose(page, T.choices.rangxay);
    await page.emulateMedia({ colorScheme: "light" });
    expect(await lookOf(page)).toBe("rangxay");
  } finally {
    await close();
  }
});
