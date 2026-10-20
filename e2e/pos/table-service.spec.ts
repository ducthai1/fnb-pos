import { newId } from "@fnb/db";
import { formatVnd, vnd } from "@fnb/domain";
import { vi as text } from "@fnb/pos/messages/vi";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import pg from "pg";
import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { backoffice, putProduct } from "./support/backoffice-calls";
import { floorOf, tableOrdersOfTill, ticketsOfOrder } from "./support/table-records";
import {
  dataOf,
  expectNoOverflow,
  openShift,
  pairedTillWithCashier,
} from "./support/till-in-browser";

const stack = inject("posStack");
const pool = new pg.Pool({ connectionString: stack.databaseUrl, max: 2 });
const tablesSetting = `/settings/branch/${stack.branchId}/tables`;
let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
}, 60_000);
afterAll(async () => {
  // The branch is shared with the other specs: it goes back to selling at the counter only.
  await backoffice(stack, "DELETE", tablesSetting, {}, 200).catch(console.error);
  await browser?.close();
  await pool.end();
});

const ids = {
  bar: newId(),
  coffee: newId(),
  tea: newId(),
  area: newId(),
  tables: [newId(), newId(), newId()],
};
const COFFEE = "Cà phê đen bàn";
const TEA = "Trà đào bàn";
const T = text.tables;
const money = (amount: number) => formatVnd(vnd(amount));
const tile = (page: Page, index: number) => page.locator(`[data-table="${ids.tables[index]}"]`);
const statusOf = (page: Page, index: number) => tile(page, index).getAttribute("data-table-status");

async function setUpShop() {
  await backoffice(stack, "PUT", tablesSetting, { value: true }, 200);
  const station = { version: null, branchId: stack.branchId, name: "Bar phục vụ bàn" };
  await backoffice(stack, "PUT", `/catalog/stations/${ids.bar}`, station, 201);
  const drink = {
    kind: "prepared_drink",
    pricingMode: "fixed",
    taxRateBp: 800,
    stationId: ids.bar,
  };
  await putProduct(stack, ids.coffee, { ...drink, name: COFFEE, basePrice: 25_000 }, null);
  await putProduct(stack, ids.tea, { ...drink, name: TEA, basePrice: 40_000 }, null);
  await floorOf(stack, ids, "Tầng trệt phục vụ bàn", ["E1", "E2", "E3"]);
}

/** A till of the branch on its floor, its shift opened on an empty drawer. */
async function tillOnTheFloor(cashier: string) {
  const till = await pairedTillWithCashier(browser!, stack, cashier);
  await openShift(till.page, []);
  await till.page.getByRole("button", { name: T.modes.tables, exact: true }).click();
  await tile(till.page, 0).waitFor();
  return till;
}

/** Sends the round, waits for the printer to take every ticket, and goes back to the order. */
async function sendRound(page: Page, units: number) {
  await page.getByRole("button", { name: T.order.sendToKitchen(units) }).click();
  await page.getByRole("heading", { name: T.slips.kitchenTitle }).waitFor();
  await page.locator("[data-print-status='printed']").first().waitFor();
  const previews = await page.locator("[data-slip-kind='kitchen'] pre").allTextContents();
  await page.getByRole("button", { name: T.slips.backToOrder }).click();
  return previews;
}

it("serves a table over two rounds, its pre-bill, a move and cash, while a second till watches", async () => {
  await setUpShop();
  const a = await tillOnTheFloor("Phục vụ bàn máy A");
  const b = await tillOnTheFloor("Phục vụ bàn máy B");
  expect(await statusOf(b.page, 0)).toBe("free");
  await expectNoOverflow(a.page, "floor");

  await tile(a.page, 0).click();
  await a.page.getByRole("heading", { name: T.order.title("E1") }).waitFor();
  await a.page.getByRole("button", { name: new RegExp(`^${COFFEE}`) }).click();
  await a.page.getByRole("button", { name: text.sale.more(COFFEE) }).click();
  const first = await sendRound(a.page, 2);
  expect(first).toEqual([expect.stringContaining(`2 x ${COFFEE}`)]);
  // Another till sees the guests once its sync pass brings them.
  await expect.poll(() => statusOf(b.page, 0), { timeout: 30_000 }).toBe("occupied");

  await a.page.getByRole("button", { name: new RegExp(`^${TEA}`) }).click();
  const second = await sendRound(a.page, 1);
  expect(second).toEqual([expect.stringContaining(`1 x ${TEA}`)]);
  expect(second[0]).not.toContain(COFFEE);
  await expect.poll(() => dataOf(a.page, "amount-due")).toBe("90000");
  await expectNoOverflow(a.page, "table order");

  await a.page.getByRole("button", { name: T.order.preBill }).click();
  await a.page.locator("[data-slip-kind='pre_bill'][data-print-status='printed']").waitFor();
  expect(await a.page.locator("[data-slip-kind='pre_bill'] pre").textContent()).toContain(
    money(90_000),
  );
  await a.page.getByRole("button", { name: T.slips.backToOrder }).click();
  await expect.poll(() => statusOf(b.page, 0), { timeout: 30_000 }).toBe("awaiting_payment");

  // E3 is taken by till B in the meantime: the move to it is refused on the spot.
  await tile(b.page, 2).click();
  await b.page.getByRole("button", { name: new RegExp(`^${COFFEE}`) }).click();
  await b.page.getByRole("button", { name: T.order.backToFloor }).click();
  await b.page.getByRole("button", { name: T.order.leaveAnyway }).click();
  await a.page.getByRole("button", { name: T.order.transfer }).click();
  // The move screen reads the floor as the till keeps it, so B's guests show there too.
  await expect.poll(() => statusOf(a.page, 2), { timeout: 30_000 }).toBe("occupied");
  await tile(a.page, 2).click();
  await a.page.getByText(T.transfer.occupied("E3")).waitFor();
  await tile(a.page, 1).click();
  await a.page.getByText(T.floor.moved("E1", "E2")).waitFor();
  // Moving changes no amount: the pre-bill the guests hold is still the bill.
  await expect.poll(() => statusOf(b.page, 1), { timeout: 30_000 }).toBe("awaiting_payment");
  await expect.poll(() => statusOf(b.page, 0), { timeout: 30_000 }).toBe("free");

  await tile(a.page, 1).click();
  await a.page.getByRole("button", { name: T.order.pay, exact: true }).click();
  await a.page.getByRole("heading", { name: text.checkout.payment.title }).waitFor();
  await a.page
    .getByRole("button", { name: text.checkout.payment.quickCash(money(100_000)) })
    .click();
  await a.page.getByRole("button", { name: text.checkout.payment.finish }).click();
  await a.page.getByRole("heading", { name: text.checkout.done.title }).waitFor();
  expect(await dataOf(a.page, "change")).toBe("10000");
  await a.page.getByText(text.sync.allSynced).waitFor({ timeout: 60_000 });
  await a.page.getByRole("button", { name: T.order.backToFloor }).click();
  await expect.poll(() => statusOf(b.page, 1), { timeout: 30_000 }).toBe("free");

  const [order, ...others] = await tableOrdersOfTill(pool, stack.tenantId, a.deviceId);
  expect(others).toEqual([]);
  expect(order).toMatchObject({
    status: "paid",
    tableId: ids.tables[1],
    tableName: "E2",
    paid: 90_000n,
  });
  // Two tickets: the coffees, then the tea alone.
  expect(await ticketsOfOrder(pool, stack.tenantId, order!.id)).toEqual([
    [{ productId: ids.coffee, quantity: "2.000" }],
    [{ productId: ids.tea, quantity: "1.000" }],
  ]);
  const [seatedByB] = await tableOrdersOfTill(pool, stack.tenantId, b.deviceId);
  expect(seatedByB).toMatchObject({ status: "draft", tableId: ids.tables[2] });
  expect(a.problems).toEqual([]);
  expect(b.problems).toEqual([]);
  await a.close();
  await b.close();
});
