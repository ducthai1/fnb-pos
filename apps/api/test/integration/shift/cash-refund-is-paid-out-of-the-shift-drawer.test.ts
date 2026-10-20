import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import type { ShiftSnapshot } from "../../../src/sync/shift-wire-types";
import type { SyncCommandEnvelope } from "../../../src/sync/sync-wire-types";
import {
  closeShift,
  freshTill,
  openedShift,
  payInShift,
  pushShift,
  rowsOf,
} from "../support/shift-commands";
import { line, orderIdOf, pullAll, pushOne, saveDraft } from "../support/sync-commands";
import { hireManager } from "../support/sync-approvals";
import { refund } from "../support/sync-order-commands";
import { type SyncShop, type Till, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
/** Refunds need the refund permission: the tills that give money back have a manager on. */
let managerId: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  s = await syncShop(app, pool);
  managerId = await hireManager(app, s);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

/** A cà phê sữa (29.000 đ) sold on `till` for cash; answers the sale and its line. */
async function coffeeSoldForCash(till: Till, shiftId?: string) {
  const coffee = line(s.menu.coffee.id);
  const draft = saveDraft(till, [coffee]);
  expect((await pushOne(app, till, draft)).status).toBe("accepted");
  const orderId = orderIdOf(draft);
  expect((await pushOne(app, till, payInShift(till, orderId, 29_000, shiftId))).status).toBe(
    "accepted",
  );
  return { orderId, lineId: coffee.lineId };
}

/** The whole coffee given back in cash, naming the shift the till is in, if any. */
function coffeeGivenBack(till: Till, sale: { orderId: string; lineId: string }, shiftId?: string) {
  const sent = refund(
    till,
    sale.orderId,
    [{ lineId: sale.lineId, quantity: "1", restock: false }],
    -29_000,
  );
  if (shiftId === undefined) return sent;
  return { ...sent, payload: { ...(sent.payload as object), shiftId } } as SyncCommandEnvelope;
}

const payoutsOf = (saleOrderId: string) =>
  rowsOf(
    pool,
    s.shop.tenantId,
    "SELECT p.shift_id, p.recorded_after_shift_close AS late, p.amount::int AS amount, " +
      "o.shift_id AS order_shift FROM payment p JOIN sales_order o ON o.id = p.order_id " +
      "WHERE o.refund_of_order_id = $1",
    [saleOrderId],
  );

describe("cash paid out for a refund", () => {
  it("comes out of the till's open shift, so a drawer counted as it stands closes even", async () => {
    const till = await freshTill(app, s, managerId);
    const shiftId = await openedShift(app, till, 200_000);
    const sale = await coffeeSoldForCash(till);
    expect((await pushOne(app, till, coffeeGivenBack(till, sale))).status).toBe("accepted");
    expect(await payoutsOf(sale.orderId)).toEqual([
      { shift_id: shiftId, late: false, amount: -29_000, order_shift: shiftId },
    ]);

    // The drawer holds 200.000 + 29.000 - 29.000.
    const closed = await pushShift(app, till, closeShift(till, 200_000));
    expect(closed.status).toBe("accepted");
    expect(closed.snapshot?.figures).toMatchObject({
      openingCash: 200_000,
      cashSales: 29_000,
      cashRefunds: 29_000,
      expectedCash: 200_000,
    });
    expect(closed.snapshot?.close).toMatchObject({ expectedCash: 200_000, difference: 0 });
  });

  it("goes into the shift the till names, beside its close when that shift closed first", async () => {
    const counter = await freshTill(app, s);
    const handheld = await freshTill(app, s, managerId);
    const shiftId = await openedShift(app, counter, 300_000);
    const sale = await coffeeSoldForCash(handheld, shiftId);
    expect((await pushShift(app, counter, closeShift(counter, 329_000))).status).toBe("accepted");
    const { cursor } = await pullAll(app, handheld);

    const late = await pushOne(app, handheld, coffeeGivenBack(handheld, sale, shiftId));
    expect(late.status).toBe("accepted");
    expect(await payoutsOf(sale.orderId)).toEqual([
      { shift_id: shiftId, late: true, amount: -29_000, order_shift: shiftId },
    ]);
    const { changes } = await pullAll(app, handheld, cursor);
    const shifts = changes.filter((c) => c.entity === "shift" && c.entityId === shiftId);
    expect(shifts).toHaveLength(1);
    const again = shifts[0]?.snapshot as ShiftSnapshot;
    expect(again.cashRecordedAfterClose).toBe(-29_000);
    expect(again.close).toMatchObject({ expectedCash: 329_000, difference: 0 });
  });

  it("is refused into a shift of another branch, and nothing is paid out", async () => {
    const elsewhere = await openedShift(app, s.otherBranchTill, 100_000);
    const till = await freshTill(app, s, managerId);
    const sale = await coffeeSoldForCash(till);
    const refused = await pushOne(app, till, coffeeGivenBack(till, sale, elsewhere));
    expect(refused).toMatchObject({ status: "rejected", code: "SYNC_SHIFT_NOT_FOUND" });
    expect(await payoutsOf(sale.orderId)).toEqual([]);
  });
});
