import { withTenant } from "@fnb/db";
import { computeOrderTotals } from "@fnb/domain";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { orderSnapshotOf } from "../../../src/sync/order-snapshot";
import { readStoredOrder } from "../../../src/sync/stored-order";
import type { SyncCommandEnvelope, SyncCommandResult } from "../../../src/sync/sync-wire-types";
import {
  latestOrders,
  line,
  orderIdOf,
  pay,
  pullAll,
  push,
  saveDraft,
  tillsClock,
} from "../support/sync-commands";
import { type SyncShop, type Till, syncShop } from "../support/sync-shop";

// Runs twice over one shop without resetting anything in between, the second time on a
// freshly built server, the way a till syncs again after a restart on the data it has.
const info = inject("testPostgres");

let s: SyncShop;
const sent = new Map<Till, SyncCommandEnvelope[]>();
const answered = new Map<string, SyncCommandResult>();
const drafts = new Map<Till, string[]>();
let firstRunCursor = "0";
let firstRunOrders = new Map<string, unknown>();

async function withServer<T>(work: (app: FastifyInstance, pool: pg.Pool) => Promise<T>) {
  const pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  const app = buildApp({ pool, clock: tillsClock() });
  try {
    return await work(app, pool);
  } finally {
    await app.close();
    await pool.end();
  }
}

async function send(app: FastifyInstance, till: Till, commands: SyncCommandEnvelope[]) {
  sent.set(till, [...(sent.get(till) ?? []), ...commands]);
  const results = await push(app, till, commands);
  for (const result of results) answered.set(result.commandId, result);
  return results;
}

// Every line carries a price of 1đ the way a till's display copy might: the server must not
// read it, so every total below is the catalog's.
const coffeeWithShot = () =>
  line(s.menu.coffee.id, {
    quantity: "2",
    unitPrice: 1,
    modifiers: [
      { groupId: s.menu.coffee.extrasGroup, optionId: s.menu.coffee.extraShot, quantity: 1 },
    ],
  });
const peachTea = (size: "sizeM" | "sizeL") =>
  line(s.menu.peachTea.id, { variantId: s.menu.peachTea[size], unitPrice: 1 });

beforeAll(async () => {
  s = await withServer((app, pool) => syncShop(app, pool));
});

describe("syncing a shop twice on the same data", () => {
  it("first run: two tills open drafts and take some payments", async () => {
    await withServer(async (app) => {
      const a = Array.from({ length: 6 }, () => saveDraft(s.tillA, [coffeeWithShot()]));
      const b = Array.from({ length: 4 }, () => saveDraft(s.tillB, [peachTea("sizeL")]));
      drafts.set(s.tillA, a.map(orderIdOf));
      drafts.set(s.tillB, b.map(orderIdOf));
      await send(app, s.tillA, [
        ...a,
        ...a.slice(0, 3).map((d) => pay(s.tillA, orderIdOf(d), 78_000)),
      ]);
      await send(app, s.tillB, [
        ...b,
        ...b.slice(0, 2).map((d) => pay(s.tillB, orderIdOf(d), 45_000)),
      ]);
      const pulled = await pullAll(app, s.tillA);
      firstRunCursor = pulled.cursor;
      firstRunOrders = latestOrders(pulled.changes);
    });
    expect([...answered.values()].every((result) => result.status === "accepted")).toBe(true);
    expect(firstRunOrders.size).toBe(10);
  });

  it("second run: replays answer as before, new work lands, and the tills converge", async () => {
    const tenantId = s.shop.tenantId;
    await withServer(async (app, pool) => {
      const replayedA = await push(app, s.tillA, sent.get(s.tillA) ?? []);
      expect(replayedA).toEqual((sent.get(s.tillA) ?? []).map((c) => answered.get(c.commandId)));
      const openA = (drafts.get(s.tillA) ?? []).slice(3);
      const edits = openA.map((orderId) =>
        saveDraft(s.tillA, [coffeeWithShot(), peachTea("sizeM")], { orderId }),
      );
      // Built in the order the till's outbox numbers them.
      const payEdits = openA.map((orderId) => pay(s.tillA, orderId, 113_000));
      const fresh = Array.from({ length: 2 }, () => saveDraft(s.tillA, [coffeeWithShot()]));
      const payFresh = fresh.map((d) => pay(s.tillA, orderIdOf(d), 78_000));
      await send(app, s.tillA, [...edits, ...payEdits, ...fresh, ...payFresh]);
      const openB = (drafts.get(s.tillB) ?? []).slice(2);
      const replayedB = await push(app, s.tillB, sent.get(s.tillB) ?? []);
      expect(replayedB.every((r) => r.status === "accepted")).toBe(true);
      await send(
        app,
        s.tillB,
        openB.map((orderId) => pay(s.tillB, orderId, 45_000)),
      );

      // Pulled on from where the first run stopped, and pulled again from scratch.
      const incremental = new Map([
        ...firstRunOrders,
        ...latestOrders((await pullAll(app, s.tillA, firstRunCursor)).changes),
      ]);
      const fromScratch = latestOrders((await pullAll(app, s.tillB)).changes);
      const server = await withTenant(pool, tenantId, async (client) => {
        const orders = new Map<string, unknown>();
        for (const orderId of fromScratch.keys()) {
          const stored = await readStoredOrder(client, orderId, false);
          if (stored !== null) orders.set(orderId, orderSnapshotOf(stored));
        }
        return orders;
      });
      expect(server.size).toBe(12);
      expect(incremental).toEqual(server);
      expect(fromScratch).toEqual(server);
    });
    expect([...answered.values()].every((result) => result.status === "accepted")).toBe(true);
  });

  it("takes in the day exactly what the paid orders' lines come to, once each", async () => {
    const day = await withServer((_app, pool) =>
      withTenant(pool, s.shop.tenantId, async (client) => {
        const taken = await client.query(
          "SELECT count(*)::int AS payments, coalesce(sum(p.amount), 0)::text AS amount FROM payment p " +
            "JOIN sales_order o ON o.id = p.order_id WHERE o.branch_id = $1 AND o.business_date = '2026-10-20'",
          [s.shop.branchId],
        );
        const paid = await client.query(
          "SELECT id FROM sales_order WHERE branch_id = $1 AND status = 'paid' AND business_date = '2026-10-20'",
          [s.shop.branchId],
        );
        let linesTotal = 0n;
        for (const { id } of paid.rows) {
          const stored = await readStoredOrder(client, id, false);
          if (stored !== null)
            linesTotal += computeOrderTotals(stored.order, stored.chargeProfile).amountDue;
        }
        return { ...taken.rows[0], paidOrders: paid.rowCount, linesTotal: linesTotal.toString() };
      }),
    );
    // 3×78.000 + 2×45.000 in the first run; 3×113.000 + 2×78.000 + 2×45.000 in the second.
    expect(day).toEqual({ payments: 12, amount: "909000", paidOrders: 12, linesTotal: "909000" });
  });
});
