import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { runCleanupRound } from "../../../src/ops/sign-in-cleanup-job";
import { ManualClock } from "../support/manual-clock";
import {
  type ProvisionedScratchDatabase,
  provisionScratchDatabase,
} from "../support/provisioned-scratch-database";
import { type StaffedShop, currentStaff, hire, staffedShop, startShift } from "../support/staffed-shop";

const info = inject("testPostgres");
const DAY = 86_400_000;
const PIN = "4826";
const SETTINGS = {
  intervalMillis: 3_600_000,
  sessionRetentionMillis: 30 * DAY,
  changeLogCompactAfterMillis: 30 * DAY,
};

let database: ProvisionedScratchDatabase;
let pool: pg.Pool;
let app: FastifyInstance;
let clock: ManualClock;

beforeAll(async () => {
  database = await provisionScratchDatabase(info);
  pool = new pg.Pool({ connectionString: database.appUrl, max: 4 });
  clock = new ManualClock(new Date());
  app = buildApp({ pool, clock });
});

afterAll(async () => {
  await app.close();
  await pool.end();
  await database.drop();
});

const staffSessionsOf = (shop: StaffedShop) =>
  withTenant(pool, shop.tenantId, async (client) =>
    (await client.query<{ id: string }>("SELECT id FROM staff_session ORDER BY id")).rows.map((row) => row.id),
  );

/** A shop whose cashier signed in at its till, then lost every backoffice member it had. */
async function shopWithoutMembers() {
  const shop = await staffedShop(app, pool);
  const staffId = await hire(app, shop, PIN);
  const signedIn = await startShift(app, shop.deviceToken, staffId, PIN);
  expect(signedIn.status).toBe(201);
  const staffToken = signedIn.body.staffSessionToken as string;
  await withTenant(pool, shop.tenantId, (client) => client.query("DELETE FROM membership"));
  // Its pairing codes were used; the next rounds take whatever is left of them.
  await runCleanupRound({ pool, clock, settings: SETTINGS });
  return { shop, staffId, staffToken };
}

describe("a tenant left without any backoffice member", () => {
  it("is refused in the backoffice at once, while its tills keep selling on live sessions", async () => {
    const { shop, staffToken } = await shopWithoutMembers();
    const backoffice = await app.inject({ method: "GET", url: "/branches", headers: { cookie: shop.managerCookie } });
    expect(backoffice.statusCode).toBe(401);
    expect((await currentStaff(app, shop.deviceToken, staffToken)).status).toBe(200);
  });

  it("ends a staff session at its expiry, and the cleanup job removes it once kept long enough", async () => {
    const { shop, staffToken } = await shopWithoutMembers();
    const expired = await staffSessionsOf(shop);
    expect(expired).toHaveLength(1);
    clock.advance(13 * 60 * 60_000);
    expect((await currentStaff(app, shop.deviceToken, staffToken)).status).toBe(401);
    // Kept for the retention, as every expired session is, in case a sign-in is looked into.
    await runCleanupRound({ pool, clock, settings: SETTINGS });
    expect(await staffSessionsOf(shop)).toEqual(expired);
    clock.advance(SETTINGS.sessionRetentionMillis);
    const report = await runCleanupRound({ pool, clock, settings: SETTINGS });
    expect(await staffSessionsOf(shop)).toEqual([]);
    expect(report.staffSessions).toBeGreaterThanOrEqual(1);
    const tenants = await pool.query<{ tenant_id: string }>(
      "SELECT tenant_id FROM fnb_auth.tenants_to_sweep() AS tenant_id",
    );
    expect(tenants.rows.map((row) => row.tenant_id)).toContain(shop.tenantId);
  });
});
