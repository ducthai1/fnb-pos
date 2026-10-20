import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import {
  closeShift,
  coffeeDraft,
  freshTill,
  openShift,
  openedShift,
  payInShift,
  pushShift,
  rowsOf,
} from "../support/shift-commands";
import { pushOne, tillsClock } from "../support/sync-commands";
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

const orderShift = async (orderId: string) =>
  rowsOf(
    pool,
    s.shop.tenantId,
    "SELECT o.status, o.shift_id AS order_shift, array_agg(p.shift_id) AS payment_shifts " +
      "FROM sales_order o LEFT JOIN payment p ON p.order_id = o.id WHERE o.id = $1 " +
      "GROUP BY o.status, o.shift_id",
    [orderId],
  );

describe("closing a shift with orders still open", () => {
  it("closes anyway, carries the open draft, and settles it in the next shift's drawer", async () => {
    const till = await freshTill(app, s);
    const first = await openedShift(app, till, 200_000);
    const paidNow = await coffeeDraft(app, s, till);
    expect((await pushOne(app, till, payInShift(till, paidNow, 29_000))).status).toBe("accepted");
    const stillOpen = await coffeeDraft(app, s, till);

    const closed = await pushShift(app, till, closeShift(till, 229_000));
    expect(closed.status).toBe("accepted");
    expect(closed.snapshot?.close).toMatchObject({ expectedCash: 229_000, openOrdersCarried: 1 });
    expect(await orderShift(stillOpen)).toEqual([
      { status: "draft", order_shift: null, payment_shifts: [null] },
    ]);

    const second = await openedShift(app, till, 200_000);
    expect((await pushOne(app, till, payInShift(till, stillOpen, 29_000))).status).toBe("accepted");
    expect(await orderShift(stillOpen)).toEqual([
      { status: "paid", order_shift: second, payment_shifts: [second] },
    ]);
    expect(await orderShift(paidNow)).toEqual([
      { status: "paid", order_shift: first, payment_shifts: [first] },
    ]);

    const settled = await pushShift(app, till, closeShift(till, 229_000));
    expect(settled.snapshot?.figures).toMatchObject({ cashSales: 29_000, expectedCash: 229_000 });
    expect(settled.snapshot?.close).toMatchObject({ difference: 0, openOrdersCarried: 0 });
  });

  it("counts only the drafts of the closing till as carried", async () => {
    const till = await freshTill(app, s);
    const other = await freshTill(app, s);
    await openedShift(app, till, 100_000);
    await coffeeDraft(app, s, other);
    const closed = await pushShift(app, till, closeShift(till, 100_000));
    expect(closed.snapshot?.close?.openOrdersCarried).toBe(0);
  });
});

describe("one shift per till", () => {
  it("refuses a second shift on a till whose shift is still open", async () => {
    const till = await freshTill(app, s);
    const first = await openedShift(app, till, 100_000);
    const refused = await pushShift(app, till, openShift(till, 100_000));
    expect(refused).toMatchObject({ status: "rejected", code: "SYNC_SHIFT_ALREADY_OPEN" });
    const open = await rowsOf(
      pool,
      s.shop.tenantId,
      "SELECT id FROM shift WHERE device_id = $1 AND status <> 'closed'",
      [till.deviceId],
    );
    expect(open).toEqual([{ id: first }]);
  });

  it("lets another till of the branch open its own shift at the same time", async () => {
    const till = await freshTill(app, s);
    const other = await freshTill(app, s);
    await openedShift(app, till, 100_000);
    expect((await pushShift(app, other, openShift(other, 100_000))).status).toBe("accepted");
  });

  it("refuses a shift id that is already taken", async () => {
    const till = await freshTill(app, s);
    const other = await freshTill(app, s);
    const taken = await openedShift(app, till, 100_000);
    const refused = await pushShift(app, other, openShift(other, 100_000, taken));
    expect(refused.code).toBe("SYNC_SHIFT_ID_TAKEN");
  });

  it("refuses an opening float its notes do not add up to", async () => {
    const till = await freshTill(app, s);
    const sent = openShift(till, 100_000);
    const payload = { ...(sent.payload as object), openingCash: 150_000 };
    expect((await pushShift(app, till, { ...sent, payload })).code).toBe(
      "DOMAIN_SHIFT_COUNT_MISMATCH",
    );
  });
});
