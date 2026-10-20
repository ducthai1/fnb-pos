import { formatVnd, vnd } from "@fnb/domain";
import { vi as text } from "@fnb/pos/messages/vi";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import pg from "pg";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { expectedAmountDue } from "./support/expected-amount-due";
import { salesOfTill } from "./support/server-records";
import { dataOf, openShift, pairedTillWithCashier, pendingBadge } from "./support/till-in-browser";

const stack = inject("posStack");
const pool = new pg.Pool({ connectionString: stack.databaseUrl, max: 2 });
let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
  await pool.end();
});

/** "Cà phê sữa", 29.000đ with optional extras, is on the shop's menu from the stack's setup. */
const COFFEE = "Cà phê sữa";

it("sells and takes cash while the API cannot be reached, and the sale reaches the server once it can", async () => {
  const till = await pairedTillWithCashier(browser!, stack, "Thu ngân quầy mất mạng");
  const { page } = till;
  await openShift(page, []);
  await page.getByText(text.sync.allSynced).waitFor({ timeout: 30_000 });

  // Every call to the API fails as with the router unplugged; the POS's own files still load.
  const api = `${stack.posOrigin}/api/**`;
  await page.route(api, (route) => route.abort("internetdisconnected"));
  await page.getByRole("button", { name: COFFEE }).click();
  await page.getByRole("button", { name: /^Thêm vào đơn/ }).click();
  const due = expectedAmountDue([{ unitPrice: 29_000, quantity: 1 }]);
  await expect.poll(() => dataOf(page, "amount-due")).toBe(String(due));
  await page.getByRole("button", { name: text.sale.checkout }).click();
  await page
    .getByRole("button", { name: text.checkout.payment.quickCash(formatVnd(vnd(50_000))) })
    .click();
  await page.getByRole("button", { name: text.checkout.payment.finish }).click();
  await page.getByRole("heading", { name: text.checkout.done.title }).waitFor();
  expect(await dataOf(page, "change")).toBe("21000");

  await page.getByText(text.sync.offline).waitFor({ timeout: 30_000 });
  // The draft, the payment and the bill's print report wait on the till.
  await expect
    .poll(async () => Number(await pendingBadge(page).getAttribute("data-pending")))
    .toBeGreaterThanOrEqual(3);
  const waiting = Number(await pendingBadge(page).getAttribute("data-pending"));
  expect(await pendingBadge(page).textContent()).toBe(text.sync.pending(waiting));
  expect(await salesOfTill(pool, stack.tenantId, till.deviceId)).toEqual([]);

  await page.unroute(api);
  // The client waits out its backoff (at most 30 s) before the next try.
  await page.getByText(text.sync.allSynced).waitFor({ timeout: 90_000 });
  await page.getByText(text.sync.online).waitFor();
  expect(await pendingBadge(page).getAttribute("data-pending")).toBe("0");
  const sales = await salesOfTill(pool, stack.tenantId, till.deviceId);
  expect(sales).toEqual([
    expect.objectContaining({ status: "paid", deviceOrderNo: 1, paid: due, payments: 1 }),
  ]);

  // Requests the route aborted are the only problems: nothing answered 4xx/5xx, nothing threw.
  const offline = (problem: { kind: string; text: string }) =>
    problem.kind === "console" && /ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(problem.text);
  expect(till.problems.filter((problem) => !offline(problem))).toEqual([]);
  await till.close();
});
