import { newId } from "@fnb/db";
import { formatVnd, vnd } from "@fnb/domain";
import { vi as text } from "@fnb/pos/messages/vi";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import pg from "pg";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { backoffice, putProduct } from "./support/backoffice-calls";
import { onceTheServerHasIt } from "./support/once-the-server-has-it";
import { printsOfOrder, salesOfTill } from "./support/server-records";
import { refusalsOfTill } from "./support/table-records";
import { dataOf, expectNoOverflow, openShift, pairedTillWithCashier } from "./support/till-in-browser";

const stack = inject("posStack");
const pool = new pg.Pool({ connectionString: stack.databaseUrl, max: 2 });
const DRINK = "Trà vải combo";
const CAKE = "Bánh bông lan combo";
const COMBO = "Combo chiều combo";
const routingSetting = `/settings/branch/${stack.branchId}/kitchen_routing`;
const money = (amount: number) => formatVnd(vnd(amount));
const ids = {
  bar: newId(),
  kitchen: newId(),
  drink: newId(),
  cake: newId(),
  combo: newId(),
  drinkSlot: newId(),
  cakeSlot: newId(),
};
let browser: Browser | undefined;

beforeAll(async () => {
  browser = await launchSystemChrome();
  // Tickets split by station: without it every item goes on the one shared slip.
  await backoffice(stack, "PUT", routingSetting, { value: true }, 200);
  // The drink is made at a bar, the cake in a kitchen of its own.
  await backoffice(
    stack,
    "PUT",
    `/catalog/stations/${ids.bar}`,
    { version: null, branchId: stack.branchId, name: "Bar combo" },
    201,
  );
  await backoffice(
    stack,
    "PUT",
    `/catalog/stations/${ids.kitchen}`,
    { version: null, branchId: stack.branchId, name: "Bếp bánh combo" },
    201,
  );
  const made = { kind: "prepared_item", pricingMode: "fixed", taxRateBp: 800 };
  await putProduct(
    stack,
    ids.drink,
    { ...made, kind: "prepared_drink", name: DRINK, basePrice: 30_000, stationId: ids.bar },
    null,
  );
  await putProduct(
    stack,
    ids.cake,
    { ...made, name: CAKE, basePrice: 20_000, stationId: ids.kitchen },
    null,
  );
  await putProduct(
    stack,
    ids.combo,
    {
      kind: "combo",
      pricingMode: "fixed",
      taxRateBp: 800,
      name: COMBO,
      basePrice: 45_000,
      combo: {
        slots: [
          {
            id: ids.drinkSlot,
            name: "Đồ uống",
            minSelect: 1,
            maxSelect: 1,
            options: [{ productId: ids.drink, variantId: null, upcharge: 0 }],
          },
          {
            id: ids.cakeSlot,
            name: "Bánh",
            minSelect: 1,
            maxSelect: 1,
            options: [{ productId: ids.cake, variantId: null, upcharge: 5_000 }],
          },
        ],
      },
    },
    null,
  );
}, 90_000);

afterAll(async () => {
  // The stack is shared: the combo and what it holds are put away.
  await backoffice(stack, "DELETE", routingSetting, {}, 200).catch(console.error);
  for (const id of [ids.combo, ids.drink, ids.cake]) {
    await backoffice(stack, "POST", `/catalog/products/${id}/archive`, {}, 200).catch(console.error);
  }
  for (const id of [ids.kitchen, ids.bar]) {
    await backoffice(stack, "DELETE", `/catalog/stations/${id}?version=1`, {}, 200).catch(
      console.error,
    );
  }
  await browser?.close();
  await pool.end();
});

it("sells a combo at the counter: the bar gets the drink, the kitchen the cake, each on its own ticket", async () => {
  const till = await pairedTillWithCashier(browser!, stack, "Thu ngân bán combo");
  const { page } = till;
  await openShift(page, []);

  await page.getByRole("button", { name: new RegExp(`^${COMBO}`) }).click();
  // The picker lists each place of the combo with what it offers; the cake costs 5.000 more.
  await page.getByRole("button", { name: new RegExp(`^${DRINK}`) }).click();
  await page.getByRole("button", { name: new RegExp(`^${CAKE}`) }).click();
  await expectNoOverflow(page, "combo picker");
  await page.getByRole("button", { name: /^Thêm vào đơn/ }).click();
  await expect.poll(() => dataOf(page, "amount-due")).toBe("50000");

  await page.getByRole("button", { name: text.sale.checkout }).click();
  await page.getByRole("heading", { name: text.checkout.payment.title }).waitFor();
  await page
    .getByRole("button", { name: text.checkout.payment.quickCash(money(50_000)) })
    .click();
  await page.getByRole("button", { name: text.checkout.payment.finish }).click();
  await page.getByRole("heading", { name: text.checkout.done.title }).waitFor();
  // The bill and one ticket for each station: every slip printed.
  const slips = page.locator("[data-print-status]");
  await expect.poll(() => slips.count()).toBe(3);
  expect(
    await slips.evaluateAll((all) => all.map((slip) => slip.getAttribute("data-print-status"))),
  ).toEqual(["printed", "printed", "printed"]);
  const tickets = await page.locator("[data-slip-kind='kitchen'] pre").allTextContents();
  expect(tickets).toHaveLength(2);
  const bar = tickets.find((slip) => slip.includes(DRINK));
  const kitchen = tickets.find((slip) => slip.includes(CAKE));
  expect(bar).toBeDefined();
  expect(kitchen).toBeDefined();
  expect(bar).not.toContain(CAKE);
  expect(kitchen).not.toContain(DRINK);
  await page.getByText(text.sync.allSynced).waitFor({ timeout: 60_000 });

  await onceTheServerHasIt(async () =>
    (await salesOfTill(pool, stack.tenantId, till.deviceId)).map((order) => order.status),
  ).toEqual(["paid"]);
  const [sale] = await salesOfTill(pool, stack.tenantId, till.deviceId);
  expect(sale).toMatchObject({ status: "paid", payments: 1, paid: 50_000n });
  // A combo made at two stations is recorded once, as one ticket, with both kitchen jobs logged.
  const prints = await printsOfOrder(pool, stack.tenantId, sale!.id);
  expect(prints.tickets).toBe(1);
  expect(prints.jobs).toEqual([
    { kind: "bill", status: "printed" },
    { kind: "kitchen", status: "printed" },
    { kind: "kitchen", status: "printed" },
  ]);
  expect(await refusalsOfTill(pool, stack.tenantId, till.deviceId)).toEqual([]);
  expect(till.problems).toEqual([]);
  await till.close();
}, 120_000);
