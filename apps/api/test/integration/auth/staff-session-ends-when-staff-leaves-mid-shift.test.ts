import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { ManualClock } from "../support/manual-clock";
import {
  type StaffedShop,
  createStaff,
  currentStaff,
  staffedShop,
  startShift,
} from "../support/staffed-shop";

// A shift lasts up to 12 hours. Someone let go, or moved to another branch, at noon must
// not keep ringing up sales and approving refunds on this till until the evening.
const info = inject("testPostgres");
const PIN = "4826";
const INVALID = { status: 401, body: { code: "API_STAFF_SESSION_INVALID" } };

let pool: pg.Pool;
let app: FastifyInstance;
let shop: StaffedShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: new ManualClock() });
  shop = await staffedShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

/** A staff member of both branches, mid-shift on the first branch's till. */
async function midShift(): Promise<{ staffId: string; token: string }> {
  const created = await createStaff(app, shop, {
    pin: PIN,
    branchIds: [shop.branchId, shop.otherBranchId],
  });
  const staffId: string = created.json().staffId;
  const { status, body } = await startShift(app, shop.deviceToken, staffId, PIN);
  expect(status).toBe(201);
  expect((await currentStaff(app, shop.deviceToken, body.staffSessionToken)).status).toBe(200);
  return { staffId, token: body.staffSessionToken };
}

const asShop = (sql: string, params: unknown[]) =>
  withTenant(pool, shop.tenantId, (client) => client.query(sql, params));

describe("a staff session in the middle of a shift", () => {
  it("is refused as soon as the staff member is deactivated", async () => {
    const { staffId, token } = await midShift();
    await asShop("UPDATE staff SET active = false WHERE id = $1", [staffId]);
    expect(await currentStaff(app, shop.deviceToken, token)).toEqual(INVALID);
  });

  it("is refused as soon as the staff member is taken off the till's branch", async () => {
    const { staffId, token } = await midShift();
    await asShop("DELETE FROM staff_branch WHERE staff_id = $1 AND branch_id = $2", [
      staffId,
      shop.branchId,
    ]);
    expect(await currentStaff(app, shop.deviceToken, token)).toEqual(INVALID);
  });

  it("carries on when the staff member is taken off some other branch", async () => {
    const { staffId, token } = await midShift();
    await asShop("DELETE FROM staff_branch WHERE staff_id = $1 AND branch_id = $2", [
      staffId,
      shop.otherBranchId,
    ]);
    expect((await currentStaff(app, shop.deviceToken, token)).status).toBe(200);
  });

  it("carries on for a colleague when someone else is deactivated", async () => {
    const leaving = await midShift();
    const staying = await midShift();
    await asShop("UPDATE staff SET active = false WHERE id = $1", [leaving.staffId]);
    expect((await currentStaff(app, shop.deviceToken, staying.token)).status).toBe(200);
  });
});
