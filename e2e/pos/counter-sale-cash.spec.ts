import { newId } from "@fnb/db";
import { formatVnd, vnd } from "@fnb/domain";
import { vi as text } from "@fnb/pos/messages/vi";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import pg from "pg";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { backoffice, putProduct } from "./support/backoffice-calls";
import { expectedAmountDue } from "./support/expected-amount-due";
import { openShiftIdOfTill, printsOfOrder, salesOfTill } from "./support/server-records";
import {
  dataOf,
  expectNoOverflow,
  openShift,
  pairedTillWithCashier,
} from "./support/till-in-browser";
import { onceTheServerHasIt } from "./support/once-the-server-has-it";

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

const ids = {
  bar: newId(),
  tea: newId(),
  sizeM: newId(),
  sizeL: newId(),
  sugar: newId(),
  sugarFull: newId(),
  toppings: newId(),
  pearl: newId(),
  coffee: newId(),
};
const TEA = "Trà sữa trân châu quầy";
const COFFEE = "Cà phê muối quầy";
const money = (amount: number) => formatVnd(vnd(amount));

/** This spec's own menu, so no other spec's edits can move its prices. */
async function setUpMenu() {
  await backoffice(
    stack,
    "PUT",
    `/catalog/stations/${ids.bar}`,
    { version: null, branchId: stack.branchId, name: "Bar quầy" },
    201,
  );
  const drink = {
    kind: "prepared_drink",
    pricingMode: "fixed",
    taxRateBp: 800,
    stationId: ids.bar,
    printCupLabel: true,
  };
  await putProduct(
    stack,
    ids.tea,
    {
      ...drink,
      name: TEA,
      basePrice: 35_000,
      variants: [
        { id: ids.sizeM, name: "M" },
        { id: ids.sizeL, name: "L", price: 45_000 },
      ],
      modifierGroups: [
        {
          id: ids.sugar,
          name: "Đường",
          minSelect: 1,
          maxSelect: 1,
          options: [{ id: ids.sugarFull, name: "100% đường" }],
        },
        {
          id: ids.toppings,
          name: "Topping",
          minSelect: 0,
          maxSelect: 2,
          allowDuplicates: true,
          options: [{ id: ids.pearl, name: "Trân châu đen", priceDelta: 5_000 }],
        },
      ],
    },
    null,
  );
  return putProduct(stack, ids.coffee, { ...drink, name: COFFEE, basePrice: 30_000 }, null);
}

it("sells two L milk teas with pearls and a coffee for cash with change, paid to the đồng into the till's shift", async () => {
  const coffeeVersion = await setUpMenu();
  const till = await pairedTillWithCashier(browser!, stack, "Thu ngân quầy tiền mặt");
  const { page } = till;
  await openShift(page, [money(500_000), money(100_000), money(100_000)]);
  const coffeeTile = page.getByRole("button", { name: COFFEE });
  await expect.poll(() => coffeeTile.textContent()).toContain(money(30_000));

  // The price changes in the backoffice: the till shows it after a sync pass, no reload.
  await putProduct(
    stack,
    ids.coffee,
    {
      kind: "prepared_drink",
      pricingMode: "fixed",
      taxRateBp: 800,
      stationId: ids.bar,
      printCupLabel: true,
      name: COFFEE,
      basePrice: 32_000,
    },
    coffeeVersion,
  );
  await expect.poll(() => coffeeTile.textContent(), { timeout: 30_000 }).toContain(money(32_000));

  await page.getByRole("button", { name: TEA }).click();
  await page.getByRole("button", { name: "L", exact: true }).click();
  await page.getByRole("button", { name: "100% đường" }).click();
  await page.getByRole("button", { name: /^Trân châu đen/ }).click();
  await page.getByRole("button", { name: text.sale.more(TEA) }).click();
  await page.getByRole("button", { name: /^Thêm vào đơn/ }).click();
  // Nothing to choose on this coffee: one tap rings it up.
  await coffeeTile.click();

  const due = expectedAmountDue([
    { unitPrice: 45_000, quantity: 2 },
    { unitPrice: 5_000, quantity: 1, option: true },
    { unitPrice: 32_000, quantity: 1 },
  ]);
  expect(due).toBe(132_000n);
  await expect.poll(() => dataOf(page, "amount-due")).toBe(String(due));
  await expectNoOverflow(page, "sale");

  await page.getByRole("button", { name: text.sale.checkout }).click();
  await page.getByRole("heading", { name: text.checkout.payment.title }).waitFor();
  await page.getByRole("button", { name: text.checkout.payment.quickCash(money(200_000)) }).click();
  expect(await dataOf(page, "change")).toBe("68000");
  await expectNoOverflow(page, "payment");
  await page.getByRole("button", { name: text.checkout.payment.finish }).click();
  await page.getByRole("heading", { name: text.checkout.done.title }).waitFor();
  expect(await dataOf(page, "change")).toBe("68000");
  // The slips are on screen once the printer answered for each and its commands were recorded;
  // only then does "all synced" cover them too.
  const slips = page.locator("[data-print-status]");
  await expect.poll(() => slips.count()).toBe(3);
  expect(
    await slips.evaluateAll((all) => all.map((slip) => slip.getAttribute("data-print-status"))),
  ).toEqual(["printed", "printed", "printed"]);
  await page.getByText(text.sync.allSynced).waitFor({ timeout: 60_000 });

  await onceTheServerHasIt(async () =>
    (await salesOfTill(pool, stack.tenantId, till.deviceId)).map((order) => order.status),
  ).toEqual(["paid"]);
  const [sale, ...others] = await salesOfTill(pool, stack.tenantId, till.deviceId);
  expect(others).toEqual([]);
  expect(sale).toMatchObject({ status: "paid", deviceOrderNo: 1, payments: 1, paid: due });
  expect(sale?.shiftId).not.toBeNull();
  expect(await openShiftIdOfTill(pool, stack.tenantId, till.deviceId)).toEqual([sale?.shiftId]);
  // The simulated printer took the bar ticket, three cup labels and the bill.
  const prints = await printsOfOrder(pool, stack.tenantId, sale!.id);
  expect(prints.tickets).toBe(1);
  expect(prints.jobs).toEqual([
    { kind: "bill", status: "printed" },
    { kind: "cup_label", status: "printed" },
    { kind: "kitchen", status: "printed" },
  ]);
  expect(till.problems).toEqual([]);
  await till.close();
});
