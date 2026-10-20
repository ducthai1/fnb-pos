import { newId } from "@fnb/db";
import { formatVnd, vnd } from "@fnb/domain";
import { vi as text } from "@fnb/pos/messages/vi";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import pg from "pg";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { EINVOICE_PROFILE } from "../../apps/api/test/integration/support/einvoice-profiles";
import { invoicingApi } from "../../apps/api/test/integration/support/einvoice-shop";
import { backoffice, putProduct } from "./support/backoffice-calls";
import { billJobsOfTill, invoicesOfTill } from "./support/invoicing-records";
import {
  dataOf,
  expectNoOverflow,
  openShift,
  pairedTillWithCashier,
} from "./support/till-in-browser";

const stack = inject("posStack");
const pool = new pg.Pool({ connectionString: stack.databaseUrl, max: 4 });
// The stack's API names no invoice provider; this instance of it, on the same database, has
// a fake one and runs its worker when the spec asks.
const invoicing = invoicingApi(pool);
const PROFILE_SETTING = `/settings/branch/${stack.branchId}/einvoice_profile`;
const asManager = { cookie: stack.managerCookie };
let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  // The branch is shared with the other specs: it stops invoicing again.
  await invoicing.app.inject({ method: "DELETE", url: PROFILE_SETTING, headers: asManager });
  await invoicing.app.close();
  await browser?.close();
  await pool.end();
});

const I = text.invoice;
const ids = { bar: newId(), drink: newId() };
const DRINK = "Trà đào hóa đơn";
const BUYER = { taxCode: "0312345678", name: "Công ty TNHH Khách Thử Hóa Đơn" };
const money = (amount: number) => formatVnd(vnd(amount));

it("invoices a sale to a company's tax code, and the till shows its lookup code once issued", async () => {
  await backoffice(
    stack,
    "PUT",
    `/catalog/stations/${ids.bar}`,
    { version: null, branchId: stack.branchId, name: "Bar hóa đơn" },
    201,
  );
  const drink = { kind: "prepared_drink", pricingMode: "fixed", taxRateBp: 800 };
  await putProduct(
    stack,
    ids.drink,
    { ...drink, stationId: ids.bar, printCupLabel: false, name: DRINK, basePrice: 45_000 },
    null,
  );
  const profile = { ...EINVOICE_PROFILE, provider: invoicing.provider.key };
  const enabled = await invoicing.app.inject({
    method: "PUT",
    url: PROFILE_SETTING,
    headers: asManager,
    payload: { value: profile },
  });
  expect(enabled.statusCode).toBe(200);

  const till = await pairedTillWithCashier(browser!, stack, "Thu ngân hóa đơn");
  const { page } = till;
  await openShift(page, []);
  await page.getByRole("button", { name: DRINK }).click();
  await expect.poll(() => dataOf(page, "amount-due")).toBe("45000");
  await page.getByRole("button", { name: text.sale.checkout }).click();
  await page.getByRole("button", { name: I.offer }).click();
  await page.getByRole("heading", { name: I.title }).waitFor();
  // Nine digits: refused on the till, with the reason under the field.
  await page.getByLabel(I.fields.taxCode).fill("031234567");
  await page.getByLabel(I.fields.name).fill(BUYER.name);
  await page.getByLabel(I.fields.address).fill("5 Nguyễn Huệ, Bến Nghé, Quận 1");
  await page.getByRole("button", { name: I.save }).click();
  await page.getByText(I.problems.tax_code).waitFor();
  await expectNoOverflow(page, "buyer info");
  await page.getByLabel(I.fields.taxCode).fill(BUYER.taxCode);
  await page.getByRole("button", { name: I.save }).click();
  await page.getByText(I.forCompany(BUYER.name, BUYER.taxCode)).waitFor();

  await page.getByRole("button", { name: text.checkout.payment.quickCash(money(50_000)) }).click();
  await page.getByRole("button", { name: text.checkout.payment.finish }).click();
  await page.getByRole("heading", { name: text.checkout.done.title }).waitFor();
  await page.getByText(text.sync.allSynced).waitFor({ timeout: 60_000 });
  expect(await invoicesOfTill(pool, stack.tenantId, till.deviceId)).toEqual([
    { status: "pending", buyerTaxCode: BUYER.taxCode, lookupCode: null },
  ]);

  // One round of the invoice worker, on the clock of now.
  invoicing.clock.advance(Date.now() - invoicing.clock.now().getTime() + 1_000);
  expect((await invoicing.workFor(stack.tenantId)).issued).toBeGreaterThanOrEqual(1);
  const [issued] = await invoicesOfTill(pool, stack.tenantId, till.deviceId);
  expect(issued).toMatchObject({ status: "issued", buyerTaxCode: BUYER.taxCode });
  const sent = invoicing.provider.callsOf("issue").map((call) => call.document.buyer?.taxCode);
  expect(sent).toContain(BUYER.taxCode);

  // The server sends the order out again; the till picks the code up on a sync pass.
  const shown = page.locator("[data-einvoice-lookup]");
  await shown.waitFor({ timeout: 60_000 });
  expect(await shown.getAttribute("data-einvoice-lookup")).toBe(issued?.lookupCode);
  await page.getByRole("button", { name: I.reprint }).click();
  const slips = page.locator("[data-print-status]");
  await expect.poll(() => slips.count()).toBe(3);
  expect(await slips.last().textContent()).toContain(`Mã tra cứu: ${issued?.lookupCode}`);
  await expectNoOverflow(page, "sale done with its invoice");
  await page.getByText(text.sync.allSynced).waitFor({ timeout: 60_000 });
  expect(await billJobsOfTill(pool, stack.tenantId, till.deviceId)).toEqual(["printed", "printed"]);
  expect(till.problems).toEqual([]);
  await till.close();
});
