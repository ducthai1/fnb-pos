import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { ManualClock } from "../support/manual-clock";
import { type StaffedShop, hire, staffedShop, startShift } from "../support/staffed-shop";

// A PIN has 10,000 values. With a lock that never grew, one paired till could try them
// all within a week; growing locks, and an audit entry for each, stop that.
const info = inject("testPostgres");
const PIN = "4826";
const WRONG = "4827";
const MINUTE = 60_000;

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

/** Fails a whole run, then reads how many minutes the lock it set has left. */
async function lockMinutesAfterRun(staffId: string): Promise<number> {
  await failTimes(staffId, 5);
  const refused = await attempt(staffId, PIN);
  expect(refused.status).toBe(429);
  return Number(refused.headers["retry-after"]) / 60;
}

async function lockEntries(staffId: string) {
  const { rows } = await withTenant(pool, shop.tenantId, (client) =>
    client.query(
      "SELECT actor_kind, actor_id, action, entity_kind, payload FROM audit_log " +
        "WHERE entity_id = $1 ORDER BY id",
      [staffId],
    ),
  );
  return rows;
}

describe("a PIN lock", () => {
  it("doubles with each lock in a row: 5, then 10, then 20 minutes", async () => {
    const staffId = await hire(app, shop, PIN);
    const minutes = [];
    for (let run = 0; run < 3; run++) {
      const left = await lockMinutesAfterRun(staffId);
      minutes.push(left);
      clock.advance(left * MINUTE);
    }
    expect(minutes).toEqual([5, 10, 20]);
  });

  it("holds the longer lock to its last millisecond", async () => {
    const staffId = await hire(app, shop, PIN);
    await lockMinutesAfterRun(staffId);
    clock.advance(5 * MINUTE);
    await lockMinutesAfterRun(staffId);
    clock.advance(10 * MINUTE - 1);
    expect((await attempt(staffId, PIN)).status).toBe(429);
    clock.advance(1);
    expect((await attempt(staffId, PIN)).status).toBe(201);
  });

  it("starts again at 5 minutes once the right PIN has been entered", async () => {
    const staffId = await hire(app, shop, PIN);
    await lockMinutesAfterRun(staffId);
    clock.advance(5 * MINUTE);
    await lockMinutesAfterRun(staffId);
    clock.advance(10 * MINUTE);
    expect((await attempt(staffId, PIN)).status).toBe(201);
    expect(await lockMinutesAfterRun(staffId)).toBe(5);
  });

  it("is written to the audit trail each time, naming the till as the actor", async () => {
    const staffId = await hire(app, shop, PIN);
    await lockMinutesAfterRun(staffId);
    const firstLockEnds = new Date(clock.now().getTime() + 5 * MINUTE);
    clock.advance(5 * MINUTE);
    await lockMinutesAfterRun(staffId);
    const secondLockEnds = new Date(clock.now().getTime() + 10 * MINUTE);
    const entry = { actor_kind: "device", actor_id: shop.deviceId, action: "staff.pin_locked" };
    expect(await lockEntries(staffId)).toEqual([
      {
        ...entry,
        entity_kind: "staff",
        payload: { failedAttempts: 5, lockedUntil: firstLockEnds.toISOString() },
      },
      {
        ...entry,
        entity_kind: "staff",
        payload: { failedAttempts: 10, lockedUntil: secondLockEnds.toISOString() },
      },
    ]);
  });

  it("is not audited for failures that stop short of a lock", async () => {
    const staffId = await hire(app, shop, PIN);
    await failTimes(staffId, 4);
    expect(await lockEntries(staffId)).toEqual([]);
  });
});
