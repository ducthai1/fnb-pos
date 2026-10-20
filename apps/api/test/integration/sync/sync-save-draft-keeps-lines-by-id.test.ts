import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import {
  type LineIntent,
  line,
  orderIdOf,
  pushOne,
  saveDraft,
  tillsClock,
} from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: tillsClock() });
  s = await syncShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const inShop = <T>(work: (client: pg.PoolClient) => Promise<T>) =>
  withTenant(pool, s.shop.tenantId, work);
const rowsOf = (orderId: string) =>
  inShop(async (client) => {
    const { rows } = await client.query(
      "SELECT id, version, quantity::text AS quantity FROM sales_order_line " +
        "WHERE order_id = $1 ORDER BY position",
      [orderId],
    );
    return rows;
  });
const withShot = () => [
  { groupId: s.menu.coffee.extrasGroup, optionId: s.menu.coffee.extraShot, quantity: 1 },
];
const tea = () => line(s.menu.peachTea.id, { variantId: s.menu.peachTea.sizeM });

/** A draft of `coffee` saved once, so tests can save it again with changes. */
async function opened(coffee: LineIntent, ...more: LineIntent[]) {
  const sent = saveDraft(s.tillA, [coffee, ...more]);
  expect((await pushOne(app, s.tillA, sent)).status).toBe("accepted");
  return orderIdOf(sent);
}
const saveAgain = (orderId: string, lines: LineIntent[]) =>
  pushOne(app, s.tillA, saveDraft(s.tillA, lines, { orderId }));

describe("order.save_draft on a draft already stored", () => {
  it("leaves the row of an unchanged line alone and updates a changed one in place", async () => {
    const coffee = line(s.menu.coffee.id);
    const orderId = await opened(coffee);
    const [before] = await rowsOf(orderId);
    expect((await saveAgain(orderId, [coffee, tea()])).status).toBe("accepted");
    expect((await rowsOf(orderId))[0]).toEqual(before);
    await saveAgain(orderId, [{ ...coffee, quantity: "2" }]);
    expect(await rowsOf(orderId)).toEqual([{ id: coffee.lineId, version: 2, quantity: "2.000" }]);
  });

  it("drops a line the cashier took off, together with its options", async () => {
    const coffee = line(s.menu.coffee.id, { modifiers: withShot() });
    const keep = tea();
    const orderId = await opened(coffee, keep);
    expect((await saveAgain(orderId, [keep])).status).toBe("accepted");
    expect((await rowsOf(orderId)).map((row) => row.id)).toEqual([keep.lineId]);
  });
});

describe("order.save_draft on a line the kitchen already has", () => {
  async function sentCoffee() {
    const coffee = line(s.menu.coffee.id, { quantity: "2", modifiers: withShot() });
    const orderId = await opened(coffee);
    await inShop((client) =>
      client.query("UPDATE sales_order_line SET sent_quantity = 2 WHERE id = $1", [coffee.lineId]),
    );
    return { coffee, orderId };
  }

  it.each([
    ["dropping it", () => [tea()]],
    ["lowering it", (coffee: LineIntent) => [{ ...coffee, quantity: "1" }]],
    ["changing its options", (coffee: LineIntent) => [{ ...coffee, modifiers: [] }]],
    ["changing its note", (coffee: LineIntent) => [{ ...coffee, note: "ít đá" }]],
  ])("refuses %s", async (_case, change) => {
    const { coffee, orderId } = await sentCoffee();
    expect(await saveAgain(orderId, change(coffee))).toMatchObject({
      status: "rejected",
      code: "SYNC_LINE_LOCKED",
    });
  });

  it("lets it grow, and says how much the kitchen has", async () => {
    const { coffee, orderId } = await sentCoffee();
    const result = await saveAgain(orderId, [{ ...coffee, quantity: "3" }]);
    expect(result.status).toBe("accepted");
    expect(result.snapshot?.lines[0]).toMatchObject({ quantity: "3", sentQuantity: "2" });
  });
});

describe("order.save_draft on a line a void points at", () => {
  const voidRecord = (orderId: string, lineId: string) =>
    inShop((client) =>
      client.query(
        "INSERT INTO line_void_record (id, tenant_id, order_id, line_id, quantity, from_unsent, " +
          "from_sent, reason_code, staff_id) VALUES ($1, $2, $3, $4, 1, 1, 0, 'wrong_item', $5)",
        [newId(), s.shop.tenantId, orderId, lineId, s.tillA.staffId],
      ),
    );

  it("keeps it exactly as it is, and lets the rest of the draft change", async () => {
    const coffee = line(s.menu.coffee.id);
    const orderId = await opened(coffee);
    await voidRecord(orderId, coffee.lineId);
    expect((await saveAgain(orderId, [coffee, tea()])).status).toBe("accepted");
    expect((await saveAgain(orderId, [{ ...coffee, quantity: "2" }])).code).toBe(
      "SYNC_LINE_LOCKED",
    );
    expect((await saveAgain(orderId, [tea()])).code).toBe("SYNC_LINE_LOCKED");
  });

  it("refuses to bring back a line a void took off the order", async () => {
    const coffee = line(s.menu.coffee.id);
    const voided = tea();
    const orderId = await opened(coffee, voided);
    await voidRecord(orderId, voided.lineId);
    await inShop((client) =>
      client.query("DELETE FROM sales_order_line WHERE id = $1", [voided.lineId]),
    );
    expect((await saveAgain(orderId, [coffee, voided])).code).toBe("SYNC_LINE_LOCKED");
    expect((await saveAgain(orderId, [coffee])).status).toBe("accepted");
  });
});
