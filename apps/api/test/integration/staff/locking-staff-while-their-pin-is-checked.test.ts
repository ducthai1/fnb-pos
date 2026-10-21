import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { verifySecret } from "../../../src/security/secret-hash";
import { approvalsOf, requestApproval } from "../support/approval-requests";
import { signedInMember } from "../support/backoffice-accounts";
import { ManualClock } from "../support/manual-clock";
import { staffTools } from "../support/staff-admin-requests";
import {
  type StaffedShop,
  currentStaff,
  hire,
  staffedShop,
  startShift,
} from "../support/staffed-shop";

const info = inject("testPostgres");
const PIN = "4826";
const MANAGER_PIN = "7391";

let pool: pg.Pool;
let app: FastifyInstance;
let shop: StaffedShop;
let tools: ReturnType<typeof staffTools>;
/** Runs once, while the next PIN is being checked (the slow hash, between transactions). */
let whilePinIsChecked: (() => Promise<void>) | null = null;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({
    pool,
    clock: new ManualClock(),
    verifySecret: async (secret, hash) => {
      const step = whilePinIsChecked;
      whilePinIsChecked = null;
      if (step !== null) await step();
      return verifySecret(secret, hash);
    },
  });
  shop = await staffedShop(app, pool);
  const owner = await signedInMember(app, pool, shop.tenantId, { roleId: shop.roleIds.owner });
  tools = staffTools(app, owner.cookie);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const lockOutWhilePinIsChecked = (staffId: string) => {
  whilePinIsChecked = async () => {
    expect((await tools.deactivate(staffId)).status).toBe(204);
  };
};

describe("locking a staff member out while their PIN is being checked", () => {
  it("opens no session, and letting them back in revives nothing", async () => {
    const staffId = await hire(app, shop, PIN);
    lockOutWhilePinIsChecked(staffId);
    const during = await startShift(app, shop.deviceToken, staffId, PIN);
    expect(during.status).toBe(404);
    expect(during.body).not.toHaveProperty("staffSessionToken");
    expect((await tools.reactivate(staffId)).status).toBe(204);
    // Back in, they sign in again with their PIN, as anyone does.
    const after = await startShift(app, shop.deviceToken, staffId, PIN);
    expect(after.status).toBe(201);
    const token = String(after.body.staffSessionToken);
    expect((await currentStaff(app, shop.deviceToken, token)).status).toBe(200);
  });

  it("records no approval from a manager locked out while typing their PIN", async () => {
    const cashierId = await hire(app, shop, PIN);
    const managerId = await hire(app, shop, MANAGER_PIN, shop.roleIds.manager);
    const cashier = await startShift(app, shop.deviceToken, cashierId, PIN);
    const staffToken = String(cashier.body.staffSessionToken);
    const ask = () =>
      requestApproval(app, shop.deviceToken, staffToken, {
        action: {
          key: "refund",
          refundAmount: "25000",
          subject: { orderId: "0190a000-0000-7000-8000-00000000000a" },
        },
        approverStaffId: managerId,
        approverPin: MANAGER_PIN,
      });
    const before = (await approvalsOf(pool, shop.tenantId)).length;
    lockOutWhilePinIsChecked(managerId);
    expect((await ask()).status).toBe(404);
    expect(await approvalsOf(pool, shop.tenantId)).toHaveLength(before);
    expect((await tools.reactivate(managerId)).status).toBe(204);
    // Active again, the same manager approves as before.
    expect((await ask()).status).toBe(201);
    expect(await approvalsOf(pool, shop.tenantId)).toHaveLength(before + 1);
  });
});
