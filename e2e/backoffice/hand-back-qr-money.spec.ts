import { vi as text } from "@fnb/backoffice/messages/vi";
import { newId } from "@fnb/db";
import { contentCodeFromRandom } from "@fnb/domain/payment";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import { randomBytes } from "node:crypto";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import {
  asOwner,
  expectNoOverflow,
  openSection,
  signedInBackoffice,
  statusAfter,
  unexpectedProblems,
} from "./support/backoffice-in-browser";
import { openShift, pairedTillWithCashier, pushAccepted } from "./support/till-over-http";

const stack = inject("backofficeStack");
const T = text.transfers;
let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

/** As long as the field takes, with no space to wrap at. */
const NOTE = "TrảLạiChịLanQuầyHaiVietcombank0071001234567".repeat(12).slice(0, 500);

/**
 * A 35.000đ order whose customer's QR transfer brought 40.000đ, which the cashier then
 * took in cash: the bank's money is the customer's. Answers the QR's content code.
 */
async function overpaidQr(): Promise<string> {
  const { body } = await asOwner(stack, "GET", "/branches");
  const brandId = (body as { branches: { id: string; brandId: string }[] }).branches.find(
    (b) => b.id === stack.branchId,
  )!.brandId;
  const productId = newId();
  const product = {
    version: null,
    brandId,
    kind: "prepared_drink",
    name: "Bạc xỉu",
    basePrice: 35_000,
    pricingMode: "fixed",
    taxRateBp: 800,
  };
  expect((await asOwner(stack, "PUT", `/catalog/products/${productId}`, product)).status).toBe(201);
  const account = { bankBin: "970436", accountNumber: "0071001234567", accountName: "PHO SANG" };
  expect(
    (
      await asOwner(stack, "PUT", `/settings/branch/${stack.branchId}/payment_account`, {
        value: account,
      })
    ).status,
  ).toBe(200);
  const secret = `s-${randomBytes(16).toString("hex")}`;
  expect(
    (await asOwner(stack, "PUT", `/payments/webhook-secrets/${stack.branchId}/fake`, { secret }))
      .status,
  ).toBe(204);
  const till = await pairedTillWithCashier(stack, "Quầy QR");
  const orderId = newId();
  const contentCode = contentCodeFromRandom(randomBytes(8));
  const line = {
    lineId: newId(),
    productId,
    variantId: null,
    modifiers: [],
    quantity: "1",
    note: null,
  };
  await pushAccepted(stack, till, [
    // A till takes money only in a shift.
    openShift(newId()),
    {
      type: "order.save_draft",
      payload: {
        orderId,
        deviceOrderNo: 1,
        serviceType: "takeaway",
        channelKey: null,
        lines: [line],
      },
    },
    {
      type: "payment.create_intent",
      payload: { intentId: newId(), orderId, amount: 35_000, contentCode },
    },
  ]);
  const notice = await fetch(`${stack.apiOrigin}/webhooks/payments/fake/${stack.tenantId}`, {
    method: "POST",
    headers: { "x-fake-secret": secret, "content-type": "application/json" },
    body: JSON.stringify({
      reference: newId(),
      amount: 40_000,
      content: `CK ${contentCode}`,
      occurredAt: new Date().toISOString(),
    }),
  });
  expect(notice.status).toBe(200);
  await pushAccepted(stack, till, [
    {
      type: "order.pay",
      payload: {
        orderId,
        payments: [{ method: "cash", amount: 35_000 }],
        expectedAmountDue: 35_000,
      },
    },
  ]);
  return contentCode;
}

it("lets the owner mark QR money handed back, on a phone, and puts it on the day's report", async () => {
  const contentCode = await overpaidQr();
  const { page, problems, close } = await signedInBackoffice(browser!, stack, {
    width: 360,
    height: 900,
  });
  await openSection(page, text.shell.nav.transfers);
  const row = page.locator("li[data-intent]").filter({ hasText: contentCode });
  await row.getByRole("button", { name: T.handBack }).click();
  const panel = row.getByRole("alertdialog");
  await panel.getByRole("radio", { name: T.handBackMethods.cash! }).check();
  await panel.getByLabel(T.handBackNote).fill(NOTE);
  await expectNoOverflow(page, "the hand-back form");
  await page.setViewportSize({ width: 360, height: 900 });
  const intentId = await row.getAttribute("data-intent");
  const confirm = panel.getByRole("button", { name: T.handBackConfirm });
  expect(await statusAfter(page, `/payments/refund-due/${intentId}`, () => confirm.click())).toBe(
    201,
  );
  await page.getByRole("status").filter({ hasText: contentCode }).waitFor();
  await expect.poll(() => row.count()).toBe(0);
  await openSection(page, text.shell.nav.dailySales);
  await page.locator('tr[data-figure="qrRefundAmount"]').filter({ hasText: "40.000" }).waitFor();
  expect(unexpectedProblems(problems)).toEqual([]);
  await close();
});
