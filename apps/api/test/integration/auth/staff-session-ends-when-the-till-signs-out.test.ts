import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
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

const signOut = async (deviceToken: string, staffToken?: string) => {
  const response = await app.inject({
    method: "DELETE",
    url: "/pos/staff-sessions/current",
    headers: {
      authorization: `Device ${deviceToken}`,
      ...(staffToken === undefined ? {} : { "x-staff-session": staffToken }),
    },
  });
  return { status: response.statusCode, body: response.json() };
};

async function shiftOn(deviceToken: string): Promise<string> {
  const staffId = await hire(app, shop, "4826");
  return (await startShift(app, deviceToken, staffId, "4826")).body.staffSessionToken;
}

describe("DELETE /pos/staff-sessions/current", () => {
  it("ends the session the till presents, and the server stops taking it", async () => {
    const token = await shiftOn(shop.deviceToken);
    expect((await currentStaff(app, shop.deviceToken, token)).status).toBe(200);
    expect(await signOut(shop.deviceToken, token)).toEqual({ status: 200, body: { ended: true } });
    expect(await currentStaff(app, shop.deviceToken, token)).toEqual(INVALID);
  });

  it("answers the same when the session is already over, unknown, or not named", async () => {
    const token = await shiftOn(shop.deviceToken);
    await signOut(shop.deviceToken, token);
    const ended = { status: 200, body: { ended: false } };
    expect(await signOut(shop.deviceToken, token)).toEqual(ended);
    expect(await signOut(shop.deviceToken, "A".repeat(43))).toEqual(ended);
    expect(await signOut(shop.deviceToken)).toEqual(ended);
  });

  it("leaves a colleague's session alone, and one that belongs to another till", async () => {
    const mine = await shiftOn(shop.deviceToken);
    const colleague = await shiftOn(shop.deviceToken);
    const other = await pairDevice(app, shop.managerCookie, shop.branchId);
    expect(await signOut(other.deviceToken, mine)).toEqual({ status: 200, body: { ended: false } });
    expect((await currentStaff(app, shop.deviceToken, mine)).status).toBe(200);
    await signOut(shop.deviceToken, mine);
    expect((await currentStaff(app, shop.deviceToken, colleague)).status).toBe(200);
  });

  it("needs the till's own credential", async () => {
    const response = await app.inject({ method: "DELETE", url: "/pos/staff-sessions/current" });
    expect([response.statusCode, response.json().code]).toEqual([401, "API_DEVICE_UNAUTHENTICATED"]);
  });
});
