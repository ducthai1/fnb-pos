import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { DEFAULT_AUTH_POLICY } from "../../../src/auth/auth-policy";
import { buildApp } from "../../../src/build-app";
import { ManualClock } from "../support/manual-clock";
import { pairDevice } from "../support/paired-devices";
import { type StaffedShop, hire, staffedShop, startShift } from "../support/staffed-shop";

const info = inject("testPostgres");
const PIN = "4826";
const WRONG = "4827";
const LOCK_MILLIS = DEFAULT_AUTH_POLICY.pin.lockMillis;

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

const attempt = (staffId: string, pin: string) => startShift(app, shop.deviceToken, staffId, pin);

const failTimes = async (staffId: string, times: number) => {
  for (let i = 0; i < times; i++) expect((await attempt(staffId, WRONG)).status).toBe(401);
};

describe("starting a shift with a PIN", () => {
  it("opens a staff session on the till for the right PIN", async () => {
    const staffId = await hire(app, shop, PIN);
    const { status, body } = await attempt(staffId, PIN);
    expect(status).toBe(201);
    expect(body).toEqual({
      staffSessionToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      staffId,
      expiresAt: new Date(
        clock.now().getTime() + DEFAULT_AUTH_POLICY.staffSessionTtlMillis,
      ).toISOString(),
    });
  });

  it("refuses a wrong PIN", async () => {
    const staffId = await hire(app, shop, PIN);
    const { status, body } = await attempt(staffId, WRONG);
    expect({ status, body }).toEqual({ status: 401, body: { code: "API_STAFF_PIN_INVALID" } });
  });

  it("still checks the attempt that reaches the limit", async () => {
    const staffId = await hire(app, shop, PIN);
    await failTimes(staffId, 4);
    expect((await attempt(staffId, PIN)).status).toBe(201);
  });

  it("counts only consecutive failures", async () => {
    const staffId = await hire(app, shop, PIN);
    await failTimes(staffId, 4);
    expect((await attempt(staffId, PIN)).status).toBe(201);
    await failTimes(staffId, 4);
    expect((await attempt(staffId, PIN)).status).toBe(201);
  });

  it("locks the staff member for 5 minutes after 5 wrong PINs, even against the right one", async () => {
    const staffId = await hire(app, shop, PIN);
    await failTimes(staffId, 5);
    const locked = await attempt(staffId, PIN);
    expect({
      status: locked.status,
      code: locked.body.code,
      retryAfter: locked.headers["retry-after"],
    }).toEqual({
      status: 429,
      code: "API_STAFF_PIN_LOCKED",
      retryAfter: String(LOCK_MILLIS / 1000),
    });
    clock.advance(LOCK_MILLIS - 1);
    expect((await attempt(staffId, PIN)).status).toBe(429);
    clock.advance(1);
    expect((await attempt(staffId, PIN)).status).toBe(201);
  });

  it("locks only that staff member: a colleague on the same till carries on", async () => {
    const locked = await hire(app, shop, PIN);
    const colleague = await hire(app, shop, "7391");
    await failTimes(locked, 5);
    expect((await attempt(colleague, "7391")).status).toBe(201);
  });

  it("refuses a till of a branch the staff member does not work at, without counting it", async () => {
    const staffId = await hire(app, shop, PIN);
    for (let i = 0; i < 6; i++) {
      const elsewhere = await startShift(app, shop.otherBranchDeviceToken, staffId, WRONG);
      expect({ status: elsewhere.status, body: elsewhere.body }).toEqual({
        status: 403,
        body: { code: "API_STAFF_NOT_IN_BRANCH" },
      });
    }
    expect((await attempt(staffId, PIN)).status).toBe(201);
  });

  it("does not know an unknown or deactivated staff member", async () => {
    const staffId = await hire(app, shop, PIN);
    await withTenant(pool, shop.tenant.tenantId, (client) =>
      client.query("UPDATE staff SET active = false WHERE id = $1", [staffId]),
    );
    for (const id of [staffId, newId()]) {
      const { status, body } = await attempt(id, PIN);
      expect({ status, body }).toEqual({ status: 404, body: { code: "API_STAFF_NOT_FOUND" } });
    }
  });

  it("refuses a revoked till before any PIN is checked", async () => {
    const staffId = await hire(app, shop, PIN);
    const till = await pairDevice(app, shop.managerCookie, shop.branchId);
    const revoke = await app.inject({
      method: "POST",
      url: `/devices/${till.deviceId}/revoke`,
      headers: { cookie: shop.managerCookie },
    });
    expect(revoke.statusCode).toBe(204);
    const { status, body } = await startShift(app, till.deviceToken, staffId, PIN);
    expect({ status, body }).toEqual({ status: 401, body: { code: "API_DEVICE_UNAUTHENTICATED" } });
  });
});
