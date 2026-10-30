import { newId } from "@fnb/db";
import { formatVnd, vnd } from "@fnb/domain";
import { vi as text } from "@fnb/pos/messages/vi";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import pg from "pg";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { backoffice, putProduct } from "./support/backoffice-calls";
import { onceTheServerHasIt } from "./support/once-the-server-has-it";
import {
  itemsOfOrder,
  refusalsOfTill,
  tableOrdersOfTill,
  ticketsOfOrder,
} from "./support/table-records";
import { tableServiceShop } from "./support/table-service-shop";
import { dataOf, expectNoOverflow } from "./support/till-in-browser";

const stack = inject("posStack");
const pool = new pg.Pool({ connectionString: stack.databaseUrl, max: 2 });
const shop = tableServiceShop(stack);
const T = text.tables;
const DRINK = "Trà vải combo";
const CAKE = "Bánh bông lan combo";
const COMBO = "Combo chiều combo";
const routingSetting = `/settings/branch/${stack.branchId}/kitchen_routing`;
const money = (amount: number) => formatVnd(vnd(amount));
const ids = {
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
  await shop.setUp();
  // Tickets split by station: without it every item goes on the one shared slip.
  await backoffice(stack, "PUT", routingSetting, { value: true }, 200);
  // The drink is made at the bar of the table-service shop, the cake in a kitchen of its own.
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
    { ...made, kind: "prepared_drink", name: DRINK, basePrice: 30_000, stationId: shop.ids.bar },
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
  // The stack is shared: the drafts at the tables, the combo and what it holds are put away.
  await shop.close(pool).catch(console.error);
  await backoffice(stack, "DELETE", routingSetting, {}, 200).catch(console.error);
  for (const id of [ids.combo, ids.drink, ids.cake]) {
    await backoffice(stack, "POST", `/catalog/products/${id}/archive`, {}, 200).catch(console.error);
  }
  await backoffice(stack, "DELETE", `/catalog/stations/${ids.kitchen}?version=1`, {}, 200).catch(
    console.error,
  );
  await browser?.close();
  await pool.end();
});

it("sells a combo at a table: the bar gets the drink, the kitchen the cake, each on its own ticket", async () => {
  const till = await shop.tillOnTheFloor(browser!, "Thu ngân bán combo");
  const { page } = till;
  await shop.tile(page, 0).click();
  await page.getByRole("heading", { name: T.order.title("E1") }).waitFor();

  await page.getByRole("button", { name: new RegExp(`^${COMBO}`) }).click();
  // The picker lists each place of the combo with what it offers; the cake costs 5.000 more.
  await page.getByRole("button", { name: new RegExp(`^${DRINK}`) }).click();
  await page.getByRole("button", { name: new RegExp(`^${CAKE}`) }).click();
  await expectNoOverflow(page, "combo picker");
  await page.getByRole("button", { name: /^Thêm vào đơn/ }).click();
  await expect.poll(() => dataOf(page, "amount-due")).toBe("50000");

  await page.getByRole("button", { name: /^Gửi bếp/ }).click();
  await page.getByRole("heading", { name: T.slips.kitchenTitle }).waitFor();
  await page.locator("[data-print-status='printed']").first().waitFor();
  await page.locator("[data-print-status='printed']").nth(1).waitFor();
  const slips = await page.locator("[data-slip-kind='kitchen'] pre").allTextContents();
  // One ticket per station, each with only its own part of the combo.
  expect(slips).toHaveLength(2);
  const bar = slips.find((slip) => slip.includes(DRINK));
  const kitchen = slips.find((slip) => slip.includes(CAKE));
  expect(bar).toBeDefined();
  expect(kitchen).toBeDefined();
  expect(bar).not.toContain(CAKE);
  expect(kitchen).not.toContain(DRINK);
  await page.getByRole("button", { name: T.slips.backToOrder }).click();

  // The server holds one combo of 50.000, sent to the stations once.
  const orderOfTill = async () => (await tableOrdersOfTill(pool, stack.tenantId, till.deviceId))[0];
  await onceTheServerHasIt(async () => {
    const found = await orderOfTill();
    return found === undefined ? 0 : (await ticketsOfOrder(pool, stack.tenantId, found.id)).length;
  }).toBe(1);
  const order = await orderOfTill();
  if (order === undefined) throw new Error("the server holds no order of the till");
  expect(order.tableName).toBe("E1");
  expect(await itemsOfOrder(pool, stack.tenantId, order.id)).toEqual({ [ids.combo]: "1.000" });
  // A combo made at two stations is recorded once, by the last ticket, as the one combo.
  expect(await ticketsOfOrder(pool, stack.tenantId, order.id)).toEqual([
    [{ productId: ids.combo, quantity: "1.000" }],
  ]);
  expect(await refusalsOfTill(pool, stack.tenantId, till.deviceId)).toEqual([]);

  await page.getByRole("button", { name: T.order.pay, exact: true }).click();
  await page.getByRole("heading", { name: text.checkout.payment.title }).waitFor();
  await page
    .getByRole("button", { name: text.checkout.payment.quickCash(money(50_000)) })
    .click();
  await page.getByRole("button", { name: text.checkout.payment.finish }).click();
  await expect
    .poll(async () => (await tableOrdersOfTill(pool, stack.tenantId, till.deviceId))[0]?.paid, {
      timeout: 30_000,
    })
    .toBe(50_000n);
  await till.close();
}, 120_000);
