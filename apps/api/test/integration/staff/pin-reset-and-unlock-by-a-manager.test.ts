import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { ManualClock } from "../support/manual-clock";
import { auditOf, staffTools } from "../support/staff-admin-requests";
import { type StaffedShop, hire, staffedShop, startShift } from "../support/staffed-shop";

const info = inject("testPostgres");
const PIN = "4826";
const WRONG = "4827";
const NEW_PIN = "7391";

let pool: pg.Pool;
let clock: ManualClock;
let app: FastifyInstance;
let shop: StaffedShop;
let tools: ReturnType<typeof staffTools>;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  clock = new ManualClock();
  app = buildApp({ pool, clock });
  shop = await staffedShop(app, pool);
  tools = staffTools(app, shop.managerCookie);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const signIn = (staffId: string, pin: string) => startShift(app, shop.deviceToken, staffId, pin);

/** Five wrong PINs in a row: the till locks them out. */
async function lockedOut(staffId: string) {
  for (let i = 0; i < 5; i++) expect((await signIn(staffId, WRONG)).status).toBe(401);
  expect((await signIn(staffId, PIN)).status).toBe(429);
}

const rowOf = async (staffId: string) => (await tools.list()).find((row) => row.id === staffId);

describe("a manager letting someone locked out by wrong PINs back in", () => {
  it("shows the lock, clears it and the count behind it, so the right PIN works at once", async () => {
    const staffId = await hire(app, shop, PIN);
    await lockedOut(staffId);
    const locked = await rowOf(staffId);
    expect(locked?.failedSignIns).toBe(5);
    expect(locked?.lockedOutUntil).toBe(new Date(clock.now().getTime() + 5 * 60_000).toISOString());
    expect(await tools.unlockPin(staffId)).toEqual({ status: 204, body: null });
    expect(await rowOf(staffId)).toMatchObject({ lockedOutUntil: null, failedSignIns: 0 });
    expect((await signIn(staffId, PIN)).status).toBe(201);
    const entries = await auditOf(pool, shop.tenantId, staffId);
    expect(entries.find((row) => row.action === "staff.pin_unlocked")?.payload).toMatchObject({
      failedAttempts: 5,
    });
  });

  it("is refused when no wrong PIN is counted against them, and a lock that ran out shows as none", async () => {
    const staffId = await hire(app, shop, PIN);
    expect(await tools.unlockPin(staffId)).toEqual({
      status: 409,
      body: { code: "API_STAFF_PIN_NOT_LOCKED" },
    });
    await lockedOut(staffId);
    clock.advance(5 * 60_000);
    // The lock is over but the count stands, and the next lock would be longer: still cleared.
    expect(await rowOf(staffId)).toMatchObject({ lockedOutUntil: null, failedSignIns: 5 });
    expect((await tools.unlockPin(staffId)).status).toBe(204);
  });
});

describe("a manager setting a new PIN", () => {
  it("lets them in with the new PIN only, and starts the count again", async () => {
    const staffId = await hire(app, shop, PIN);
    await lockedOut(staffId);
    expect(await tools.resetPin(staffId, NEW_PIN)).toEqual({ status: 204, body: null });
    expect((await signIn(staffId, PIN)).status).toBe(401);
    expect((await signIn(staffId, NEW_PIN)).status).toBe(201);
    const entry = (await auditOf(pool, shop.tenantId, staffId)).find(
      (row) => row.action === "staff.pin_reset",
    );
    expect(entry?.payload).toEqual({ clearedFailedAttempts: 5 });
    expect(JSON.stringify(entry)).not.toContain(NEW_PIN);
  });

  it("holds the new PIN to the same rules as a first one, and keeps the old PIN on a refusal", async () => {
    const staffId = await hire(app, shop, PIN);
    expect(await tools.resetPin(staffId, "1234")).toEqual({
      status: 400,
      body: { code: "API_STAFF_PIN_TOO_WEAK" },
    });
    expect(await tools.resetPin(staffId, "12a4")).toEqual({
      status: 400,
      body: { code: "API_STAFF_PIN_FORMAT" },
    });
    expect((await tools.resetPin(staffId, "1".repeat(17))).status).toBe(400);
    expect(await tools.resetPin(shop.deviceId, NEW_PIN)).toEqual({
      status: 404,
      body: { code: "API_STAFF_NOT_FOUND" },
    });
    expect((await signIn(staffId, PIN)).status).toBe(201);
  });
});
