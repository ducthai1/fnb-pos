import { vi as text } from "@fnb/backoffice/messages/vi";
import { HOSTILE_MENU } from "@fnb/backoffice/test-support/hostile-catalog";
import { newId } from "@fnb/db";
import { HOSTILE_NAMES } from "@fnb/pos/test-support/hostile-names";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import {
  asOwner,
  expectNoOverflow,
  openSection,
  signedInBackoffice,
  unexpectedProblems,
} from "./support/backoffice-in-browser";
import { openShift, pairedTillWithCashier, pushAccepted, soldInCash } from "./support/till-over-http";

const stack = inject("backofficeStack");
const N = text.shell.nav;
let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  await browser?.close();
});

/**
 * As long as each field takes, with no space to wrap at. The product is a name of its own:
 * specs share the stack, and the menu spec looks its hostile product up by name.
 */
const PRODUCT_NAME = "CàPhêMuốiĐậmĐàKemBéoNgậySữaTươi".repeat(3).slice(0, 80);
const AREA_NAME = HOSTILE_MENU.sizeName.slice(0, 60);
const TABLE_NAME = HOSTILE_MENU.productName.slice(0, 40);
const PRINTER = `${HOSTILE_MENU.productName}${HOSTILE_NAMES.unknownCode}`.slice(0, 100);

/** A sale of a product with the worst name, a slip of it that never printed, a floor of hostile names. */
async function hostileDay() {
  const { body } = await asOwner(stack, "GET", "/branches");
  const brandId = (body as { branches: { id: string; brandId: string }[] }).branches.find((b) => b.id === stack.branchId)!.brandId;
  const productId = newId();
  const product = await asOwner(stack, "PUT", `/catalog/products/${productId}`, {
    version: null,
    brandId,
    kind: "prepared_drink",
    name: PRODUCT_NAME,
    basePrice: 35_000,
    pricingMode: "fixed",
    taxRateBp: 800,
  });
  expect(product.status).toBe(201);
  const till = await pairedTillWithCashier(stack, HOSTILE_NAMES.branch);
  const sale = soldInCash(productId, 1, 35_000);
  const orderId = (sale[0]!.payload as { orderId: string }).orderId;
  await pushAccepted(stack, till, [openShift(newId()), ...sale]);
  await pushAccepted(stack, till, [
    {
      type: "print.job_reported",
      payload: {
        jobId: newId(),
        kind: "bill",
        status: "failed",
        attempts: 3,
        printerKey: PRINTER,
        orderId,
        errorCode: HOSTILE_NAMES.unknownCode,
        occurredAt: new Date().toISOString(),
      },
    },
  ]);
  const areaId = newId();
  const area = await asOwner(stack, "PUT", `/floor/areas/${areaId}`, { version: null, branchId: stack.branchId, name: AREA_NAME });
  expect(area.status).toBe(201);
  const table = await asOwner(stack, "PUT", `/floor/tables/${newId()}`, {
    version: null,
    areaId,
    name: TABLE_NAME,
    x: 0,
    y: 0,
    width: 1_000,
    height: 1_000,
    shape: "rectangle",
    seats: 99,
  });
  expect(table.status).toBe(201);
  const account = { bankBin: "970436", accountNumber: "0071001234567", accountName: HOSTILE_MENU.productName };
  const saved = await asOwner(stack, "PUT", `/settings/branch/${stack.branchId}/payment_account`, { value: account });
  expect(saved.status).toBe(200);
}

it("keeps every new page inside a phone and a computer screen with hostile names", async () => {
  await hostileDay();
  const { page, problems, close } = await signedInBackoffice(browser!, stack, { width: 360, height: 900 });

  for (const [link, ready] of [
    [N.dailySales, PRODUCT_NAME],
    [N.printFailures, PRINTER],
    [N.floor, text.floor.area(AREA_NAME)],
    [N.dayClose, text.dayClose.openShiftsTitle],
    [N.transfers, text.transfers.refundTitle],
    [N.settings, text.settings.switchesTitle],
  ] as const) {
    await page.setViewportSize({ width: 360, height: 900 });
    await openSection(page, link);
    await page.getByText(ready, { exact: false }).first().waitFor();
    await expectNoOverflow(page, link);
  }
  expect(unexpectedProblems(problems)).toEqual([]);
  await close();
});
