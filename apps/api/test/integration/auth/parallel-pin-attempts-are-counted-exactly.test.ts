import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { ManualClock } from "../support/manual-clock";
import { type ObservedSecretCheck, observedSecretCheck } from "../support/observed-secret-check";
import { type StaffedShop, hire, staffedShop, startShift } from "../support/staffed-shop";

// Guesses sent together are the case a row lock exists for: each attempt is counted under
// it before the slow PIN check, so the count cannot be read stale by a parallel guess.
const info = inject("testPostgres");
const PIN = "4826";
const WRONG = "4827";
const GUESSES = 20;

let pool: pg.Pool;
let app: FastifyInstance;
let shop: StaffedShop;
let check: ObservedSecretCheck;

beforeAll(async () => {
  // Enough connections that every guess is in flight at once rather than queued.
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app"), max: GUESSES + 5 });
  check = observedSecretCheck();
  app = buildApp({ pool, clock: new ManualClock(), verifySecret: check.verify });
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

function tally(statuses: number[]): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const status of statuses) counts[status] = (counts[status] ?? 0) + 1;
  return counts;
}

describe("PIN attempts sent at the same time", () => {
  it(`check exactly 5 of ${GUESSES} wrong PINs, refuse the rest, and then the right one`, async () => {
    const staffId = await hire(app, shop, PIN);
    const answers = await Promise.all(
      Array.from({ length: GUESSES }, () => attempt(staffId, WRONG)),
    );
    expect(tally(answers.map((a) => a.status))).toEqual({ 401: 5, 429: GUESSES - 5 });
    expect((await attempt(staffId, PIN)).status).toBe(429);
  });

  it("leave the lock that guesses set while a right PIN was still being checked", async () => {
    const staffId = await hire(app, shop, PIN);
    const held = check.hold(PIN);
    const right = attempt(staffId, PIN);
    await held.reached;
    // Counted after the right PIN: the fourth of these reaches the limit and locks.
    await failTimes(staffId, 4);
    expect((await attempt(staffId, WRONG)).status).toBe(429);
    held.release();
    expect((await right).status).toBe(201);
    expect((await attempt(staffId, PIN)).status).toBe(429);
  });

  it("let a right PIN that was itself the attempt reaching the limit clear that lock", async () => {
    const staffId = await hire(app, shop, PIN);
    await failTimes(staffId, 4);
    expect((await attempt(staffId, PIN)).status).toBe(201);
    expect((await attempt(staffId, WRONG)).status).toBe(401);
  });
});
