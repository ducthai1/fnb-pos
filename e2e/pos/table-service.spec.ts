import { formatVnd, vnd } from "@fnb/domain";
import { vi as text } from "@fnb/pos/messages/vi";
import { launchSystemChrome } from "@fnb/sync-client/test-support/system-chrome";
import pg from "pg";
import type { Browser, Page } from "playwright-core";
import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { onceTheServerHasIt } from "./support/once-the-server-has-it";
import {
  itemsOfOrder,
  refusalsOfTill,
  tableOrdersOfTill,
  ticketsOfOrder,
} from "./support/table-records";
import { COFFEE, TEA, tableServiceShop } from "./support/table-service-shop";
import { dataOf, expectNoOverflow } from "./support/till-in-browser";

const stack = inject("posStack");
const pool = new pg.Pool({ connectionString: stack.databaseUrl, max: 2 });
const shop = tableServiceShop(stack);
const { ids, tile, statusOf } = shop;
let browser: Browser | undefined;
beforeAll(async () => {
  browser = await launchSystemChrome();
  await shop.setUp();
}, 60_000);
afterAll(async () => {
  await shop.close().catch(console.error);
  await browser?.close();
  await pool.end();
});

const T = text.tables;
const money = (amount: number) => formatVnd(vnd(amount));
const tillOnTheFloor = (cashier: string) => shop.tillOnTheFloor(browser!, cashier);
const STALE = "SYNC_ORDER_VERSION_STALE";
const refusals = (deviceId: string) => refusalsOfTill(pool, stack.tenantId, deviceId);

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
  // Every save named the version it was edited from, and each was the server's version.
  for (const till of [a, b]) expect(await refusals(till.deviceId)).toEqual([]);
  expect(a.problems).toEqual([]);
  expect(b.problems).toEqual([]);
  await a.close();
  await b.close();
});

it("keeps what two tills add to one table at once, the first one's save held offline", async () => {
  const c = await tillOnTheFloor("Phục vụ bàn máy C");
  const d = await tillOnTheFloor("Phục vụ bàn máy D");
  await tile(c.page, 0).click();
  await c.page.getByRole("heading", { name: T.order.title("E1") }).waitFor();
  await c.page.getByRole("button", { name: new RegExp(`^${COFFEE}`) }).click();
  await expect.poll(() => statusOf(d.page, 0), { timeout: 30_000 }).toBe("occupied");
  const [order] = await tableOrdersOfTill(pool, stack.tenantId, c.deviceId);
  const items = () => itemsOfOrder(pool, stack.tenantId, order!.id);

  // C's next item waits on the till while D adds to the same order.
  const api = `${stack.posOrigin}/api/**`;
  await c.page.route(api, (route) => route.abort("internetdisconnected"));
  await c.page.getByRole("button", { name: new RegExp(`^${TEA}`) }).click();
  await tile(d.page, 0).click();
  await d.page.getByRole("heading", { name: T.order.title("E1") }).waitFor();
  await d.page.getByRole("button", { name: new RegExp(`^${COFFEE}`) }).click();
  await onceTheServerHasIt(items).toEqual({ [ids.coffee]: "2.000" });

  await c.page.unroute(api);
  await onceTheServerHasIt(items).toEqual({ [ids.coffee]: "2.000", [ids.tea]: "1.000" });
  await expect.poll(() => dataOf(c.page, "amount-due"), { timeout: 30_000 }).toBe("90000");
  expect(await c.page.getByRole("alert").count()).toBe(0);
  // Refused once over D's version, then saved again over it.
  expect(await refusals(c.deviceId)).toEqual([{ type: "order.save_draft", code: STALE }]);
  expect(await refusals(d.deviceId)).toEqual([]);
  const offline = (problem: { kind: string; text: string }) =>
    problem.kind === "console" && /ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(problem.text);
  expect(c.problems.filter((problem) => !offline(problem))).toEqual([]);
  expect(d.problems).toEqual([]);
  await c.close();
  await d.close();
});
