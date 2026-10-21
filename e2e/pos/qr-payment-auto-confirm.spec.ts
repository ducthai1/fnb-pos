import { newId } from "@fnb/db";
import { vnd } from "@fnb/domain";
import { parseVietQrPayload } from "@fnb/domain/payment";
import { vi as text } from "@fnb/pos/messages/vi";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import pg from "pg";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { backoffice, putProduct } from "./support/backoffice-calls";
import { intentWithCode, qrPaidSalesOfTill, sepayForBranch } from "./support/bank-notices";
import {
  dataOf,
  expectNoOverflow,
  openShift,
  pairedTillWithCashier,
} from "./support/till-in-browser";
import { onceTheServerHasIt } from "./support/once-the-server-has-it";

const stack = inject("posStack");
const pool = new pg.Pool({ connectionString: stack.databaseUrl, max: 4 });
const ACCOUNT_SETTING = `/settings/branch/${stack.branchId}/payment_account`;
const ACCOUNT = { bankBin: "970436", accountNumber: "0011001234567", accountName: "QUAN THU QR" };
let browser: Browser | undefined;
let bank: Awaited<ReturnType<typeof sepayForBranch>> | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
  bank = await sepayForBranch(stack, pool);
}, 60_000);
afterAll(async () => {
  // The branch is shared with the other specs: it goes back to having no account.
  await backoffice(stack, "DELETE", ACCOUNT_SETTING, {}, 200);
  await bank?.close();
  await browser?.close();
  await pool.end();
});

const ids = { bar: newId(), drink: newId() };
const DRINK = "Bạc xỉu chuyển khoản";

it("sells a drink by VietQR, which the till closes by itself once the bank's notice arrives", async () => {
  await backoffice(
    stack,
    "PUT",
    `/catalog/stations/${ids.bar}`,
    { version: null, branchId: stack.branchId, name: "Bar QR" },
    201,
  );
  await putProduct(
    stack,
    ids.drink,
    {
      kind: "prepared_drink",
      pricingMode: "fixed",
      taxRateBp: 800,
      stationId: ids.bar,
      printCupLabel: false,
      name: DRINK,
      basePrice: 39_000,
    },
    null,
  );
  await backoffice(stack, "PUT", ACCOUNT_SETTING, { value: ACCOUNT }, 200);
  const till = await pairedTillWithCashier(browser!, stack, "Thu ngân chuyển khoản");
  const { page } = till;
  await openShift(page, []);
  await page.getByRole("button", { name: DRINK }).click();
  await expect.poll(() => dataOf(page, "amount-due")).toBe("39000");
  await page.getByRole("button", { name: text.sale.checkout }).click();
  await page.getByRole("heading", { name: text.checkout.payment.title }).waitFor();
  // Choosing the QR card of the payment drawer draws the QR for the whole order.
  await page.getByRole("button", { name: text.qr.title, exact: true }).click();
  await page.locator('[data-qr-phase="waiting"]').waitFor();
  await expectNoOverflow(page, "qr payment");

  const code = (await dataOf(page, "qr-content")) ?? "";
  expect(parseVietQrPayload((await dataOf(page, "qr-text")) ?? "")).toMatchObject({
    bankBin: ACCOUNT.bankBin,
    accountNumber: ACCOUNT.accountNumber,
    amount: vnd(39_000),
    content: code,
  });
  // The QR reached the server before the customer pays it.
  await expect
    .poll(() => intentWithCode(pool, stack.tenantId, code), { timeout: 60_000 })
    .toMatchObject({
      status: "pending",
      amount: 39_000,
    });
  const intent = await intentWithCode(pool, stack.tenantId, code);

  // A notice nobody signed is turned away, and the till keeps waiting.
  expect(await bank!.notify(39_000, `CK ${code}`, "not-the-shop-secret-123")).toBe(401);
  expect(await intentWithCode(pool, stack.tenantId, code)).toMatchObject({ status: "pending" });
  expect(await dataOf(page, "qr-phase")).toBe("waiting");

  // The customer's bank writes its own words around the code.
  expect(await bank!.notify(39_000, `MBVCB.4412.${code}.tra tien ca phe`)).toBe(200);
  await page.getByRole("heading", { name: text.checkout.done.title }).waitFor({ timeout: 60_000 });
  await page.getByText(text.sync.allSynced).waitFor({ timeout: 60_000 });
  await onceTheServerHasIt(() => qrPaidSalesOfTill(pool, stack.tenantId, till.deviceId)).toEqual([
    {
      status: "paid",
      method: "qr_transfer",
      amount: 39_000,
      paymentIntentId: intent?.id,
      intentStatus: "paid",
    },
  ]);
  expect(till.problems).toEqual([]);
  await till.close();
});
