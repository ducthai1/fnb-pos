import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import {
  approval,
  closeShift,
  coffeeDraft,
  freshTill,
  openedShift,
  payInShift,
  pushShift,
  rowsOf,
} from "../support/shift-commands";
import { hire } from "../support/staffed-shop";
import { pushOne, tillsClock } from "../support/sync-commands";
import { type SyncShop, type Till, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");
const MANAGER_PIN = "7391";

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
let managerId: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: tillsClock() });
  s = await syncShop(app, pool);
  managerId = await hire(app, s.shop, MANAGER_PIN, s.shop.roleIds.manager);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const shiftRow = async (shiftId: string) =>
  (
    await rowsOf(
      pool,
      s.shop.tenantId,
      "SELECT status, counted_cash::int AS counted, expected_cash::int AS expected, " +
        "difference::int AS difference, close_approval_id, closed_by_staff_id FROM shift WHERE id = $1",
      [shiftId],
    )
  )[0];

/** A manager's acceptance of exactly `difference` (counted − expected) on `till`. */
const acceptDifference = (till: Till, shiftId: string, difference: number) =>
  approval(
    app,
    till,
    { key: "accept_close_difference", difference: String(difference), subject: { shiftId } },
    managerId,
    MANAGER_PIN,
  );

/** A till whose shift opened on a 500.000 đ float and sold one coffee (29.000 đ) in cash. */
async function tillWithSale() {
  const till = await freshTill(app, s);
  const shiftId = await openedShift(app, till, 500_000);
  const orderId = await coffeeDraft(app, s, till);
  expect((await pushOne(app, till, payInShift(till, orderId, 29_000))).status).toBe("accepted");
  return { till, shiftId };
}

describe("shift.close", () => {
  it("settles a drawer that matches the server's cash book, and answers with the closing figures", async () => {
    const { till, shiftId } = await tillWithSale();
    const result = await pushShift(app, till, closeShift(till, 529_000));
    expect(result.status).toBe("accepted");
    expect(result.snapshot?.figures).toMatchObject({ openingCash: 500_000, cashSales: 29_000 });
    expect(result.snapshot?.close).toMatchObject({
      expectedCash: 529_000,
      countedCash: 529_000,
      difference: 0,
      approvalId: null,
      closedByStaffId: s.tillA.staffId,
    });
    expect(result.snapshot?.close?.denominations[0]).toEqual({ denomination: 500_000, pieces: 1 });
    expect(await shiftRow(shiftId)).toMatchObject({ status: "closed", difference: 0 });
  });

  it("refuses a cashier's short count without an approval, and leaves the shift open", async () => {
    const { till, shiftId } = await tillWithSale();
    const refused = await pushShift(app, till, closeShift(till, 509_000));
    expect(refused).toMatchObject({ status: "rejected", code: "SYNC_APPROVAL_REQUIRED" });
    expect(await shiftRow(shiftId)).toMatchObject({ status: "open", counted: null });
    expect((await pushShift(app, till, closeShift(till, 529_000))).status).toBe("accepted");
  });

  it("refuses a surplus without an approval just like a shortfall", async () => {
    const { till } = await tillWithSale();
    const refused = await pushShift(app, till, closeShift(till, 530_000));
    expect(refused.code).toBe("SYNC_APPROVAL_REQUIRED");
  });

  it("accepts the difference with a manager's approval and records who accepted it", async () => {
    const { till, shiftId } = await tillWithSale();
    const approvalId = await acceptDifference(till, shiftId, -20_000);
    const result = await pushShift(app, till, closeShift(till, 509_000, { approvalId }));
    expect(result.status).toBe("accepted");
    expect(result.snapshot?.close).toMatchObject({ difference: -20_000, approvalId });
    expect(await shiftRow(shiftId)).toMatchObject({
      counted: 509_000,
      expected: 529_000,
      difference: -20_000,
      close_approval_id: approvalId,
    });
  });

  it("lets someone holding accept_close_difference close with a difference alone", async () => {
    const till = await freshTill(app, s, managerId, MANAGER_PIN);
    const shiftId = await openedShift(app, till, 500_000);
    expect((await pushShift(app, till, closeShift(till, 480_000))).status).toBe("accepted");
    expect(await shiftRow(shiftId)).toMatchObject({ difference: -20_000, close_approval_id: null });
  });

  it("accepts a difference up to the till's tolerance alone, and not one note more", async () => {
    const till = await freshTill(app, s);
    await withTenant(pool, s.shop.tenantId, (client) =>
      client.query(
        "INSERT INTO config_value (id, tenant_id, scope_kind, scope_id, key, value) " +
          "VALUES ($1, $2, 'device', $3, 'shift_close_difference_tolerance', $4)",
        [newId(), s.shop.tenantId, till.deviceId, JSON.stringify("20000")],
      ),
    );
    await openedShift(app, till, 500_000);
    expect((await pushShift(app, till, closeShift(till, 480_000))).status).toBe("accepted");
    await openedShift(app, till, 500_000);
    const refused = await pushShift(app, till, closeShift(till, 479_500));
    expect(refused.code).toBe("SYNC_APPROVAL_REQUIRED");
  });
});

describe("shift.close refusals", () => {
  it("refuses an approval granted for another action", async () => {
    const { till, shiftId } = await tillWithSale();
    const forCash = await approval(
      app,
      till,
      { key: "cash_move", amount: "900000", subject: { shiftId } },
      managerId,
      MANAGER_PIN,
    );
    const refused = await pushShift(app, till, closeShift(till, 509_000, { approvalId: forCash }));
    expect(refused.code).toBe("SYNC_APPROVAL_FOR_ANOTHER_ACTION");
  });

  it("refuses an approval granted on another till", async () => {
    const { till, shiftId } = await tillWithSale();
    const elsewhere = await acceptDifference(s.tillA, shiftId, -20_000);
    const refused = await pushShift(
      app,
      till,
      closeShift(till, 509_000, { approvalId: elsewhere }),
    );
    expect(refused.code).toBe("SYNC_APPROVAL_NOT_FOR_THIS_STAFF");
  });

  it("refuses an approval of an earlier close for the next shift's close", async () => {
    const { till, shiftId } = await tillWithSale();
    const approvalId = await acceptDifference(till, shiftId, -20_000);
    expect((await pushShift(app, till, closeShift(till, 509_000, { approvalId }))).status).toBe(
      "accepted",
    );
    await openedShift(app, till, 500_000);
    // Bound to the shift it closed: even unspent it would cover no other shift's close.
    const reused = await pushShift(app, till, closeShift(till, 480_000, { approvalId }));
    expect(reused.code).toBe("SYNC_APPROVAL_FOR_ANOTHER_SUBJECT");
  });

  it("refuses a stated total its notes do not add up to", async () => {
    const { till } = await tillWithSale();
    const sent = closeShift(till, 529_000);
    const refused = await pushShift(app, till, {
      ...sent,
      payload: { ...(sent.payload as object), counted: 530_000 },
    });
    expect(refused.code).toBe("DOMAIN_SHIFT_COUNT_MISMATCH");
  });

  it("refuses a close on a till with no open shift", async () => {
    const till = await freshTill(app, s);
    expect((await pushShift(app, till, closeShift(till, 0))).code).toBe("SYNC_NO_OPEN_SHIFT");
  });
});
