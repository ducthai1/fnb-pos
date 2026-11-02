import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { readOpenOrders } from "../../../src/routes/pos/bootstrap-open-orders";
import { orderSnapshotOf } from "../../../src/sync/order-snapshot";
import { readStoredOrder, readStoredOrdersByIds } from "../../../src/sync/stored-order";
import type { SyncCommandEnvelope } from "../../../src/sync/sync-wire-types";
import { expectStatus } from "../support/catalog-shop";
import { kitchenStation, sentToKitchen, ticketLine } from "../support/kitchen-commands";
import { approve, hireManager, signInAs, voidOfSent } from "../support/sync-approvals";
import { command, line, orderIdOf, push, pushOne, saveDraft, tillsClock } from "../support/sync-commands";
import { discount, percentOffLine, voidUnits, withApproval } from "../support/sync-order-commands";
import { type SyncShop, type Till, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");
// A note as long as a till takes, in Vietnamese with no space to break at.
const LONG_NOTE = "ítđườngnhiềuđákhôngđánhthêmtrânchâuđenvàthạchdừa".repeat(5).slice(0, 200);

let pool: pg.Pool;
let app: FastifyInstance;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: tillsClock() });
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

/** A client that counts the statements sent through it: each is a round trip. */
function counting(client: pg.ClientBase) {
  let trips = 0;
  const proxy = new Proxy(client, {
    get(target, key, receiver) {
      if (key === "query") {
        return (...args: Parameters<pg.ClientBase["query"]>) => {
          trips += 1;
          return (target.query as (...a: unknown[]) => unknown)(...args);
        };
      }
      const value = Reflect.get(target, key, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { client: proxy as pg.ClientBase, trips: () => trips };
}

/** The open orders as bootstrap answers them, and the round trips it took. */
async function bootstrapOrders(s: SyncShop) {
  return withTenant(pool, s.shop.tenantId, async (client) => {
    const counted = counting(client);
    const orders = await readOpenOrders(counted.client, s.shop.branchId);
    return { orders, trips: counted.trips() };
  });
}

/** The same orders read one by one, as bootstrap used to: the answer the batch must match. */
async function oneByOne(s: SyncShop, ids: readonly string[]) {
  return withTenant(pool, s.shop.tenantId, async (client) => {
    const orders: unknown[] = [];
    for (const id of ids) {
      const stored = await readStoredOrder(client, id, false);
      if (stored !== null) orders.push({ ...orderSnapshotOf(stored) });
    }
    return orders;
  });
}

async function pushAll(app: FastifyInstance, till: Till, commands: SyncCommandEnvelope[]) {
  for (let at = 0; at < commands.length; at += 100) {
    const results = await push(app, till, commands.slice(at, at + 100));
    const refused = results.filter((result) => result.status !== "accepted");
    if (refused.length > 0) throw new Error(`refused: ${JSON.stringify(refused[0])}`);
  }
}

describe("bootstrap reading a branch's open orders", () => {
  it.each([1, 50, 300])("takes the same few round trips for %i open orders", async (count) => {
    const s = await syncShop(app, pool);
    const drafts = Array.from({ length: count }, () =>
      saveDraft(s.tillA, [line(s.menu.coffee.id, { note: LONG_NOTE }), line(s.menu.peachTea.id, { variantId: s.menu.peachTea.sizeL })]),
    );
    await pushAll(app, s.tillA, drafts);
    const { orders, trips } = await bootstrapOrders(s);
    expect(orders).toHaveLength(count);
    // The orders, their lines, their payments, and the refund amounts of any refund.
    expect(trips).toBeLessThanOrEqual(4);
    expect(JSON.stringify(orders)).toBe(JSON.stringify(await oneByOne(s, drafts.map(orderIdOf))));
  });

  it("answers byte for byte what reading each order alone answered, on hostile orders", async () => {
    const s = await syncShop(app, pool);
    const bar = await kitchenStation(app, s);
    const managerId = await hireManager(app, s);
    const beans = newId();
    await expectStatus(
      app.inject({
        method: "PUT",
        url: `/catalog/products/${beans}`,
        headers: { cookie: s.shop.managerCookie },
        payload: {
          version: null,
          brandId: s.brandId,
          kind: "retail_item",
          taxRateBp: 0,
          pricingMode: "weighed",
          name: "Cà phê hạt Cầu Đất rang mộc xay sẵn",
          basePrice: 32_000,
          measureUnit: "100g",
        },
      }),
      201,
    );
    const { coffee, peachTea, combo } = s.menu;
    // A combo with its picks, a coffee with two options 999 times, a long note.
    const comboLine = line(combo.id, {
      comboPicks: [
        { slotId: combo.drinkSlot, productId: peachTea.id, variantId: peachTea.sizeL, modifiers: [] },
        { slotId: combo.extraSlot, productId: coffee.id, variantId: null, modifiers: [] },
      ],
    });
    const optioned = line(coffee.id, {
      quantity: "999",
      note: LONG_NOTE,
      modifiers: [
        { groupId: coffee.extrasGroup, optionId: coffee.extraShot, quantity: 1 },
        { groupId: coffee.extrasGroup, optionId: coffee.saltedCream, quantity: 1 },
      ],
    });
    const table = saveDraft(s.tillA, [comboLine, optioned]);
    // Weighed lines, one per 100 g as the menu has it.
    const weighed = saveDraft(s.tillA, [line(beans, { quantity: "3.5", measureUnit: "100g" }), line(beans, { quantity: "0.25" })]);
    // A line sent to the bar, then two of its three units voided with a manager's approval.
    const sentLine = line(coffee.id, { quantity: "3" });
    const voided = saveDraft(s.tillA, [sentLine]);
    // Discounts on the whole order and on one line.
    const discountedLine = line(peachTea.id, { variantId: peachTea.sizeM, quantity: "7" });
    const discounted = saveDraft(s.tillA, [discountedLine, line(coffee.id)]);
    await pushAll(app, s.tillA, [table, weighed, voided, discounted]);
    expect((await pushOne(app, s.tillA, sentToKitchen(s.tillA, orderIdOf(voided), bar, [ticketLine(sentLine.lineId, "3")]))).status).toBe("accepted");
    const approvalId = await approve(app, s.tillA, managerId, voidOfSent(orderIdOf(voided), sentLine.lineId, "2"));
    expect(
      (await pushOne(app, s.tillA, withApproval(voidUnits(s.tillA, orderIdOf(voided), sentLine.lineId, "2"), approvalId))).status,
    ).toBe("accepted");
    // A manager at the till gives the discounts, which the cashier may not.
    await signInAs(app, s, s.tillA, "manager");
    await pushAll(app, s.tillA, [
      discount(s.tillA, orderIdOf(discounted), { scope: "order", discount: { kind: "percent", rate: 1_000 } }),
      percentOffLine(s.tillA, orderIdOf(discounted), discountedLine.lineId, 500),
    ]);
    const ids = [table, weighed, voided, discounted].map(orderIdOf);
    const { orders } = await bootstrapOrders(s);
    const expected = await oneByOne(s, ids);
    expect(JSON.stringify(orders)).toBe(JSON.stringify(expected));
    // The orders hold what they were meant to: combo picks under their combo, weighed lines
    // with their unit, a void taking back sent units, and discount lines.
    const lines = (orders as { lines: { parentLineId: string | null; lineType: string; measureUnit?: string; reversesLineId: string | null }[] }[]).flatMap(
      (order) => order.lines,
    );
    expect(lines.filter((each) => each.lineType === "combo_component").length).toBeGreaterThanOrEqual(2);
    expect(lines.filter((each) => each.lineType === "modifier").length).toBeGreaterThanOrEqual(2);
    expect(lines.filter((each) => each.measureUnit === "100g")).toHaveLength(2);
    expect(lines.some((each) => each.reversesLineId !== null)).toBe(true);
    expect(lines.filter((each) => each.lineType === "discount").length).toBeGreaterThanOrEqual(2);
    // Paid with the money split three ways, read by id in a batch: the same as alone.
    const sale = saveDraft(s.tillA, [line(coffee.id)]);
    const paidId = orderIdOf(sale);
    await pushAll(app, s.tillA, [sale, splitPayment(s.tillA, paidId, 29_000)]);
    const batch = await withTenant(pool, s.shop.tenantId, async (client) =>
      (await readStoredOrdersByIds(client, [paidId, ids[0]!])).map((stored) => ({ ...orderSnapshotOf(stored) })),
    );
    expect(JSON.stringify(batch)).toBe(JSON.stringify(await oneByOne(s, [paidId, ids[0]!])));
    expect(batch[0]?.payments).toHaveLength(3);
  });
});

/** order.pay in cash, card and cash again, adding up to the amount due. */
function splitPayment(till: Till, orderId: string, due: number) {
  const third = Math.floor(due / 3);
  return command(till, "order.pay", {
    orderId,
    expectedAmountDue: due,
    payments: [
      { method: "cash", amount: third },
      { method: "card", amount: third },
      { method: "cash", amount: due - 2 * third },
    ],
  });
}
