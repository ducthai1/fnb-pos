import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import type { ShiftSnapshot } from "../../../src/sync/shift-wire-types";
import {
  closeShift,
  coffeeDraft,
  freshTill,
  openedShift,
  payInShift,
  pushShift,
  rowsOf,
} from "../support/shift-commands";
import { pullAll, pushOne } from "../support/sync-commands";
import { type SyncShop, type Till, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  s = await syncShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const paymentOf = async (orderId: string) =>
  (
    await rowsOf(
      pool,
      s.shop.tenantId,
      "SELECT p.shift_id, p.recorded_after_shift_close AS late, o.shift_id AS order_shift " +
        "FROM payment p JOIN sales_order o ON o.id = p.order_id WHERE p.order_id = $1",
      [orderId],
    )
  )[0];

const closeOf = async (shiftId: string) =>
  (
    await rowsOf(
      pool,
      s.shop.tenantId,
      "SELECT counted_cash::int AS counted, expected_cash::int AS expected, " +
        "difference::int AS difference, version FROM shift WHERE id = $1",
      [shiftId],
    )
  )[0];

/**
 * The counter till opens a shift; a handheld of the branch takes an order and, offline,
 * its cash, while the counter closes on a count that cannot include it.
 */
async function closedBeforeTheHandheldSynced() {
  const counter = await freshTill(app, s);
  const handheld: Till = await freshTill(app, s);
  const shiftId = await openedShift(app, counter, 300_000);
  const orderId = await coffeeDraft(app, s, handheld);
  expect((await pushShift(app, counter, closeShift(counter, 300_000))).status).toBe("accepted");
  return { counter, handheld, shiftId, orderId };
}

describe("a payment that reaches the server after its shift closed", () => {
  it("stays in the shift it was taken in, marked as recorded after the close", async () => {
    const { counter, handheld, shiftId, orderId } = await closedBeforeTheHandheldSynced();
    const next = await openedShift(app, counter, 300_000);
    const closedBefore = await closeOf(shiftId);

    const late = await pushOne(app, handheld, payInShift(handheld, orderId, 29_000, shiftId));
    expect(late.status).toBe("accepted");
    expect(await paymentOf(orderId)).toEqual({
      shift_id: shiftId,
      late: true,
      order_shift: shiftId,
    });
    // The close stays as it was counted; the adjustment is shown beside it.
    expect(await closeOf(shiftId)).toEqual(closedBefore);
    const nextClose = await pushShift(app, counter, closeShift(counter, 300_000));
    expect(nextClose.snapshot?.figures.cashSales).toBe(0);
    expect(nextClose.snapshot?.id).toBe(next);
  });

  it("sends the closed shift out again with the late cash beside its unchanged close", async () => {
    const { handheld, shiftId, orderId } = await closedBeforeTheHandheldSynced();
    const seen = await pullAll(app, handheld);
    const copiesOf = (changes: typeof seen.changes) =>
      changes
        .filter((c) => c.entity === "shift" && c.entityId === shiftId)
        .map((c) => c.snapshot as ShiftSnapshot);
    const closedCopy = copiesOf(seen.changes).at(-1);
    expect(closedCopy?.status).toBe("closed");
    await pushOne(app, handheld, payInShift(handheld, orderId, 29_000, shiftId));
    const shifts = copiesOf((await pullAll(app, handheld, seen.cursor)).changes);
    expect(shifts).toHaveLength(1);
    const snapshot = shifts[0] as ShiftSnapshot;
    // A till keeps the copy it has until a strictly newer one arrives.
    expect(snapshot.version).toBeGreaterThan(closedCopy?.version ?? Number.POSITIVE_INFINITY);
    expect(snapshot.cashRecordedAfterClose).toBe(29_000);
    expect(snapshot.figures.cashSales).toBe(0);
    expect(snapshot.close).toMatchObject({ expectedCash: 300_000, difference: 0 });
  });

  it("goes into an open shift it names without being marked late", async () => {
    const counter = await freshTill(app, s);
    const handheld = await freshTill(app, s);
    const shiftId = await openedShift(app, counter, 300_000);
    const orderId = await coffeeDraft(app, s, handheld);
    await pushOne(app, handheld, payInShift(handheld, orderId, 29_000, shiftId));
    expect(await paymentOf(orderId)).toEqual({
      shift_id: shiftId,
      late: false,
      order_shift: shiftId,
    });
    const closed = await pushShift(app, counter, closeShift(counter, 329_000));
    expect(closed.snapshot?.close?.difference).toBe(0);
  });
});

describe("the shift a payment names", () => {
  it("must be a shift of the till's own branch", async () => {
    const elsewhere = await openedShift(app, s.otherBranchTill, 100_000);
    const handheld = await freshTill(app, s);
    const orderId = await coffeeDraft(app, s, handheld);
    const refused = await pushOne(app, handheld, payInShift(handheld, orderId, 29_000, elsewhere));
    expect(refused).toMatchObject({ status: "rejected", code: "SYNC_SHIFT_NOT_FOUND" });
    expect(refused.snapshot?.status).toBe("draft");
  });

  it("must exist", async () => {
    const handheld = await freshTill(app, s);
    const orderId = await coffeeDraft(app, s, handheld);
    const refused = await pushOne(app, handheld, payInShift(handheld, orderId, 29_000, newId()));
    expect(refused.code).toBe("SYNC_SHIFT_NOT_FOUND");
  });

  it("defaults to the till's own open shift, and to none on a till without one", async () => {
    const till = await freshTill(app, s);
    const own = await openedShift(app, till, 100_000);
    const inShift = await coffeeDraft(app, s, till);
    await pushOne(app, till, payInShift(till, inShift, 29_000));
    expect(await paymentOf(inShift)).toEqual({ shift_id: own, late: false, order_shift: own });
    const bare = await freshTill(app, s);
    const outside = await coffeeDraft(app, s, bare);
    await pushOne(app, bare, payInShift(bare, outside, 29_000));
    expect(await paymentOf(outside)).toEqual({ shift_id: null, late: false, order_shift: null });
  });
});
