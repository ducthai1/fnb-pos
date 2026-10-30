import { vi as text } from "@fnb/backoffice/messages/vi";
import { newId } from "@fnb/db";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import type { PageProblem } from "../support/page-problems";
import { choose } from "./support/price-list-in-browser";
import {
  expectNoOverflow,
  openSection,
  signedInBackoffice,
  statusAfter,
  unexpectedProblems,
} from "./support/backoffice-in-browser";
import { openShift, pairedTillWithCashier, pushAccepted, tillBootstrap, todayAtTheBranch } from "./support/till-over-http";

const stack = inject("backofficeStack");
const S = text.settings;
const D = text.dayClose;
let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

const switchRow = (page: Page, key: string) => page.locator(`li[data-setting-key="${key}"]`);
const settingPath = (key: string) => `/settings/branch/${stack.branchId}/${key}`;
const dayClosePath = `/branches/${stack.branchId}/day-close`;

/** The status of the POST the page sends to `path` while `act` runs. */
async function postStatus(page: Page, path: string, act: () => Promise<void>) {
  const answered = page.waitForResponse(
    (response) => response.request().method() === "POST" && new URL(response.url()).pathname === `/api${path}`,
  );
  await act();
  return (await answered).status();
}

/** The refusals this spec provokes on purpose, as the browser reports them (response and console line). */
const provoked = (problem: PageProblem) =>
  (problem.url.endsWith(`/api${dayClosePath}`) && problem.text.includes("409"));

it("explains a refused switch under it, and saves the receiving account all the way to the tills", async () => {
  const { page, problems, close } = await signedInBackoffice(browser!, stack);
  await openSection(page, text.shell.nav.settings);
  await page.getByRole("heading", { name: S.switchesTitle }).waitFor();

  // QR ordering is not something the till does yet: its row is locked and says so, and a
  // switch the till follows (tables) is taken.
  const qr = switchRow(page, "qr_ordering");
  expect(await qr.getByRole("checkbox").isDisabled()).toBe(true);
  await qr.getByText(S.comingSoon, { exact: true }).waitFor();
  // The e-invoice switch means nothing: the row sends the owner to the profile instead.
  expect(await switchRow(page, "einvoice").getByRole("checkbox").count()).toBe(0);
  await switchRow(page, "einvoice").getByText(S.support.seeProfile).waitFor();
  const tables = switchRow(page, "tables").getByRole("checkbox");
  expect(await statusAfter(page, settingPath("tables"), () => tables.click())).toBe(200);
  await expect.poll(() => tables.isChecked()).toBe(true);
  expect(await switchRow(page, "tables").getByRole("alert").count()).toBe(0);

  const account = page.locator('section[data-setting-key="payment_account"]');
  await choose(account, S.account.bank, /\(970436\)/);
  await account.getByLabel(S.account.accountNumber).fill("0071 0012 3456 7");
  await account.getByLabel(S.account.accountName).fill("PHO SANG Q1");
  const save = account.getByRole("button", { name: text.common.save });
  expect(await statusAfter(page, settingPath("payment_account"), () => save.click())).toBe(200);
  await account.getByText(text.common.saved).waitFor();
  const { config } = await tillBootstrap(stack, stack.deviceToken);
  expect(config.settings.payment_account).toEqual({
    bankBin: "970436",
    accountNumber: "0071001234567",
    accountName: "PHO SANG Q1",
  });

  await expectNoOverflow(page, "settings");
  expect(unexpectedProblems(problems).filter((problem) => !provoked(problem))).toEqual([]);
  await close();
});

it("refuses to close a day while a till's shift is open, listing that shift", async () => {
  const till = await pairedTillWithCashier(stack, "Quầy chốt ngày");
  const shiftId = newId();
  await pushAccepted(stack, till, [openShift(shiftId)]);

  const { page, problems, close } = await signedInBackoffice(browser!, stack);
  await openSection(page, text.shell.nav.dayClose);
  // The day field takes the day as dd/mm/yyyy, as a person types it.
  const [year, month, day] = todayAtTheBranch().split("-");
  await page.getByLabel(D.dateLabel).fill(`${day}/${month}/${year}`);
  const openShifts = page.locator('[data-day-list="open-shifts"]');
  await openShifts.getByText(D.shift(shiftId)).waitFor();

  await page.getByRole("button", { name: D.close }).click();
  const confirm = page.getByRole("alertdialog");
  expect(await postStatus(page, dayClosePath, () => confirm.getByRole("button", { name: D.close }).click())).toBe(409);
  const refusal = page.locator("[data-close-refused]");
  await expect.poll(() => refusal.getByRole("alert").textContent()).toBe(text.errors.byCode.API_DAY_CLOSE_SHIFTS_OPEN);
  await refusal.locator('[data-day-list="blocking-shifts"]').getByText(D.shift(shiftId)).waitFor();
  expect(await page.locator('[data-day-state="open"]').count()).toBe(1);

  await expectNoOverflow(page, "day close refused");
  expect(unexpectedProblems(problems).filter((problem) => !provoked(problem))).toEqual([]);
  await close();
});
