import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import {
  approval,
  cashMove,
  closeShift,
  freshTill,
  openedShift,
  pushShift,
  rowsOf,
} from "../support/shift-commands";
import { hire, startShift } from "../support/staffed-shop";
import { type SyncShop, type Till, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");
const MANAGER_PIN = "7391";
const SECOND_CASHIER_PIN = "5162";

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
let managerId: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  s = await syncShop(app, pool);
  managerId = await hire(app, s.shop, MANAGER_PIN, s.shop.roleIds.manager);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

// The cashier template may move up to 500.000 đ alone in a shift.
const move = (till: Till, kind: "in" | "out", amount: number, approvalId?: string) =>
  pushShift(
    app,
    till,
    cashMove(till, kind, amount, approvalId === undefined ? {} : { approvalId }),
  );
const approvedFor = (till: Till, amount: number) =>
  approval(app, till, { key: "cash_move", amount: String(amount) }, managerId, MANAGER_PIN);

/** A till with a 2.000.000 đ float in an open shift. */
async function openTill() {
  const till = await freshTill(app, s);
  const shiftId = await openedShift(app, till, 2_000_000);
  return { till, shiftId };
}

describe("shift.cash_move", () => {
  it("adds every move of the cashier in the shift, in and out alike, up to the cap", async () => {
    const { till } = await openTill();
    expect((await move(till, "out", 300_000)).status).toBe("accepted");
    const atCap = await move(till, "in", 200_000);
    expect(atCap.status).toBe("accepted");
    expect(atCap.snapshot?.figures).toMatchObject({ cashIn: 200_000, cashOut: 300_000 });
    expect(atCap.snapshot?.figures.expectedCash).toBe(1_900_000);
  });

  it("refuses the move that takes the total past the cap, though it is small on its own", async () => {
    const { till, shiftId } = await openTill();
    await move(till, "out", 300_000);
    await move(till, "in", 200_000);
    const refused = await move(till, "out", 1_000);
    expect(refused).toMatchObject({ status: "rejected", code: "SYNC_APPROVAL_REQUIRED" });
    const moves = await rowsOf(
      pool,
      s.shop.tenantId,
      "SELECT amount::int AS amount FROM cash_move WHERE shift_id = $1",
      [shiftId],
    );
    expect(moves).toHaveLength(2);
  });

  it("takes it with a manager's approval for the new total, and records the approval", async () => {
    const { till, shiftId } = await openTill();
    await move(till, "out", 450_000);
    const approvalId = await approvedFor(till, 550_000);
    expect((await move(till, "out", 100_000, approvalId)).status).toBe("accepted");
    const stored = await rowsOf(
      pool,
      s.shop.tenantId,
      "SELECT approval_id FROM cash_move WHERE shift_id = $1 AND approval_id IS NOT NULL",
      [shiftId],
    );
    expect(stored).toEqual([{ approval_id: approvalId }]);
  });

  it("refuses an approval for less than the new total", async () => {
    const { till } = await openTill();
    await move(till, "out", 450_000);
    const tooSmall = await approvedFor(till, 100_000);
    expect((await move(till, "out", 100_000, tooSmall)).code).toBe("SYNC_APPROVAL_INVALID");
  });

  it("refuses an approval already spent on an earlier move", async () => {
    const { till } = await openTill();
    await move(till, "out", 450_000);
    const approvalId = await approvedFor(till, 2_000_000);
    expect((await move(till, "out", 100_000, approvalId)).status).toBe("accepted");
    expect((await move(till, "out", 100_000, approvalId)).code).toBe("SYNC_APPROVAL_ALREADY_USED");
  });

  it("keeps each staff member's total apart, on the same till and shift", async () => {
    const { till } = await openTill();
    await move(till, "out", 500_000);
    const secondId = await hire(app, s.shop, SECOND_CASHIER_PIN);
    const session = await startShift(app, till.deviceToken, secondId, SECOND_CASHIER_PIN);
    // The same till hands over to the second cashier; its command numbers carry on.
    Object.assign(till, { staffId: secondId, staffToken: session.body.staffSessionToken });
    expect((await move(till, "out", 400_000)).status).toBe("accepted");
    expect((await move(till, "out", 100_001)).code).toBe("SYNC_APPROVAL_REQUIRED");
  });

  it("starts every shift from nothing", async () => {
    const { till } = await openTill();
    await move(till, "out", 500_000);
    expect((await pushShift(app, till, closeShift(till, 1_500_000))).status).toBe("accepted");
    await openedShift(app, till, 2_000_000);
    expect((await move(till, "out", 500_000)).status).toBe("accepted");
  });

  it("is refused on a till with no open shift", async () => {
    const till = await freshTill(app, s);
    expect((await move(till, "in", 10_000)).code).toBe("SYNC_NO_OPEN_SHIFT");
  });
});
