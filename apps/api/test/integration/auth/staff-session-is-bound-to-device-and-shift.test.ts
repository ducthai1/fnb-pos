import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { DEFAULT_AUTH_POLICY } from "../../../src/auth/auth-policy";
import { buildApp } from "../../../src/build-app";
import { ManualClock } from "../support/manual-clock";
import { pairDevice } from "../support/paired-devices";
import {
  type StaffedShop,
  currentStaff,
  hire,
  staffedShop,
  startShift,
} from "../support/staffed-shop";

const info = inject("testPostgres");
const INVALID = { status: 401, body: { code: "API_STAFF_SESSION_INVALID" } };

let pool: pg.Pool;
let clock: ManualClock;
let app: FastifyInstance;
let shop: StaffedShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  clock = new ManualClock();
  app = buildApp({ pool, clock });
  shop = await staffedShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

async function shiftOn(deviceToken: string): Promise<{ staffId: string; token: string }> {
  const staffId = await hire(app, shop, "4826");
  const { body } = await startShift(app, deviceToken, staffId, "4826");
  return { staffId, token: body.staffSessionToken };
}

describe("a staff session", () => {
  it("names the staff member working the till and what their role allows", async () => {
    const { staffId, token } = await shiftOn(shop.deviceToken);
    expect(await currentStaff(app, shop.deviceToken, token)).toEqual({
      status: 200,
      body: {
        staffId,
        displayName: "Lan",
        roleId: shop.roleId,
        expiresAt: new Date(
          clock.now().getTime() + DEFAULT_AUTH_POLICY.staffSessionTtlMillis,
        ).toISOString(),
        grants: {
          permissionKeys: ["line_discount", "cash_move", "open_price", "transfer_table"],
          thresholds: { line_discount: { maxRate: 1_000 }, cash_move: { maxAmount: "500000" } },
        },
      },
    });
  });

  it("lasts one shift: until the moment it expires, and not after", async () => {
    const { token } = await shiftOn(shop.deviceToken);
    clock.advance(DEFAULT_AUTH_POLICY.staffSessionTtlMillis - 1);
    expect((await currentStaff(app, shop.deviceToken, token)).status).toBe(200);
    clock.advance(1);
    expect(await currentStaff(app, shop.deviceToken, token)).toEqual(INVALID);
  });

  it("is worthless on any other till, even one of the same branch", async () => {
    const { token } = await shiftOn(shop.deviceToken);
    const sameBranch = await pairDevice(app, shop.managerCookie, shop.branchId);
    expect(await currentStaff(app, sameBranch.deviceToken, token)).toEqual(INVALID);
  });

  it("ends with its till: once the device is revoked the till itself is refused", async () => {
    const till = await pairDevice(app, shop.managerCookie, shop.branchId);
    const { token } = await shiftOn(till.deviceToken);
    await app.inject({
      method: "POST",
      url: `/devices/${till.deviceId}/revoke`,
      headers: { cookie: shop.managerCookie },
    });
    expect(await currentStaff(app, till.deviceToken, token)).toEqual({
      status: 401,
      body: { code: "API_DEVICE_UNAUTHENTICATED" },
    });
  });

  it("is refused when missing or unknown", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/pos/staff-sessions/current",
      headers: { authorization: `Device ${shop.deviceToken}` },
    });
    expect({ status: response.statusCode, body: response.json() }).toEqual(INVALID);
    expect(await currentStaff(app, shop.deviceToken, "A".repeat(43))).toEqual(INVALID);
  });
});
