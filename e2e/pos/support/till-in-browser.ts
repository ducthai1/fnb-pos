import { vi as text } from "@fnb/pos/messages/vi";
import { measureScreenOverflow } from "@fnb/pos/test-support/measure-screen-overflow";
import type { Browser, Page } from "playwright-core";
import { expect } from "vitest";
import type { PosStack } from "../../support/global-setup-start-pos-stack";
import { type PageProblem, watchPageProblems } from "../../support/page-problems";
import { cashierAndPairingCode } from "./backoffice-calls";

export interface TillInBrowser {
  page: Page;
  problems: PageProblem[];
  deviceId: string;
  close(): Promise<void>;
}

/**
 * A new till in its own browser context (its own OPFS database): paired with a code from the
 * backoffice, a new cashier signed in with the PIN, on the screen that opens the shift.
 */
export async function pairedTillWithCashier(
  browser: Browser,
  stack: PosStack,
  cashier: string,
): Promise<TillInBrowser> {
  const pin = "5937";
  const code = await cashierAndPairingCode(stack, cashier, pin);
  const context = await browser.newContext({ viewport: { width: 800, height: 900 } });
  const page = await context.newPage();
  const problems = watchPageProblems(page);
  await page.goto(stack.posOrigin);
  // Exists only once React rendered the pairing screen, after the database opened.
  await page.getByLabel(text.pairing.codeLabel).fill(code);
  const paired = page.waitForResponse((response) => response.url().endsWith("/api/devices/pair"));
  await page.getByRole("button", { name: text.pairing.submit }).click();
  const pairing = await paired;
  expect(pairing.status()).toBe(201);
  const { deviceId } = (await pairing.json()) as { deviceId: string };
  await page.getByRole("button", { name: cashier }).click();
  for (const digit of pin) await page.getByRole("button", { name: digit, exact: true }).click();
  const signedIn = page.waitForResponse((response) =>
    response.url().endsWith("/api/pos/staff-sessions"),
  );
  await page.getByRole("button", { name: text.staff.submit }).click();
  expect((await signedIn).status()).toBe(201);
  await page.getByRole("heading", { name: text.checkout.openShift.title }).waitFor();
  return { page, problems, deviceId, close: () => context.close() };
}

/** Taps notes into the float, opens the shift, and waits for the menu to be on screen. */
export async function openShift(page: Page, notes: readonly string[]) {
  for (const note of notes)
    await page
      .getByRole("button", { name: text.checkout.openShift.addNote(note), exact: true })
      .click();
  await page.getByRole("button", { name: text.checkout.openShift.open, exact: true }).click();
  await page.getByRole("region", { name: text.sale.menuLabel }).waitFor();
}

/** The screen fits at phone width and at tablet width, measured on the element that scrolls. */
export async function expectNoOverflow(page: Page, label: string) {
  for (const width of [360, 800]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await measureScreenOverflow(page);
    expect(overflow, `${label} at ${width}px`).toMatchObject({
      scrollerExcess: 0,
      pageExcess: 0,
      outside: [],
    });
  }
}

/** What the sync badge says, e.g. "Chưa đồng bộ 3 lệnh". */
export const pendingBadge = (page: Page) => page.locator("[data-pending]");

/** An element's data attribute, read once React has rendered it. */
export async function dataOf(page: Page, attribute: string): Promise<string | null> {
  return page.locator(`[data-${attribute}]`).first().getAttribute(`data-${attribute}`);
}
