import { randomBytes } from "node:crypto";
import {
  type PurgeCutoffs,
  newId,
  purgeExpiredCodesAndSessions,
  purgeTenantCodesAndSessions,
  withTenant,
} from "@fnb/db";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { installCleanupJob } from "../../../src/ops/sign-in-cleanup-job";
import { hashToken } from "../../../src/security/opaque-token";
import { addMember, createAccount, uniqueEmail } from "../support/backoffice-accounts";
import { ManualClock } from "../support/manual-clock";
import {
  type ProvisionedScratchDatabase,
  provisionScratchDatabase,
} from "../support/provisioned-scratch-database";
import { hire, staffedShop } from "../support/staffed-shop";
import { withClient } from "../support/with-client";

const info = inject("testPostgres");
const NOW = new Date("2026-10-20T08:00:00.000Z");
const DAY = 86_400_000;
const RETENTION = 30 * DAY;
const at = (offset: number) => new Date(NOW.getTime() + offset);
const CUTOFFS: PurgeCutoffs = { codesExpiredBefore: NOW, sessionsExpiredBefore: at(-RETENTION) };

/** One shop's rows, by what the sweep must do with them. */
interface SweptShop {
  tenantId: string;
  codes: { expired: string; live: string };
  staffSessions: { old: string; recent: string; live: string };
  backofficeSessions: { old: string; recent: string; live: string };
}

let database: ProvisionedScratchDatabase;
let pool: pg.Pool;

beforeAll(async () => {
  database = await provisionScratchDatabase(info);
  pool = new pg.Pool({ connectionString: database.appUrl, max: 4 });
});

afterAll(async () => {
  await pool.end();
  await database.drop();
});

async function sweptShop(): Promise<SweptShop> {
  const app = buildApp({ pool });
  const shop = await staffedShop(app, pool);
  const staffId = await hire(app, shop, "4826");
  await app.close();
  const accountId = await createAccount(pool, { email: uniqueEmail("sweep") });
  const { appUserId } = await addMember(pool, shop.tenantId, accountId);
  const ids = () => ({ old: newId(), recent: newId(), live: newId() });
  const codes = { expired: newId(), live: newId() };
  const staffSessions = ids();
  const backofficeSessions = ids();
  const expiries = { old: at(-RETENTION - DAY), recent: at(-DAY), live: at(DAY) };
  const token = () => hashToken(randomBytes(16).toString("hex"));
  await withTenant(pool, shop.tenantId, async (client) => {
    for (const [id, expiresAt] of [
      [codes.expired, at(-60_000)],
      [codes.live, at(60_000)],
    ] as const) {
      await client.query(
        "INSERT INTO device_pairing_code (id, tenant_id, branch_id, code_hash, " +
          "created_by_app_user_id, expires_at) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, shop.tenantId, shop.branchId, token(), appUserId, expiresAt],
      );
    }
    for (const key of ["old", "recent", "live"] as const) {
      await client.query(
        "INSERT INTO staff_session (id, tenant_id, staff_id, device_id, token_hash, expires_at) " +
          "VALUES ($1, $2, $3, $4, $5, $6)",
        [staffSessions[key], shop.tenantId, staffId, shop.deviceId, token(), expiries[key]],
      );
    }
  });
  for (const key of ["old", "recent", "live"] as const) {
    await pool.query("SELECT fnb_auth.create_session($1, $2, $3, $4, $5, $6)", [
      backofficeSessions[key],
      token(),
      accountId,
      shop.tenantId,
      expiries[key],
      at(-RETENTION - 8 * DAY),
    ]);
  }
  return { tenantId: shop.tenantId, codes, staffSessions, backofficeSessions };
}

async function remaining(shop: SweptShop) {
  const tenantRows = await withTenant(pool, shop.tenantId, async (client) => ({
    codes: (await client.query("SELECT id FROM device_pairing_code")).rows.map((r) => r.id),
    staffSessions: (await client.query("SELECT id FROM staff_session")).rows.map((r) => r.id),
  }));
  const ours = Object.values(shop.backofficeSessions);
  const backoffice = await withClient(database.superuserUrl, (client) =>
    client.query("SELECT id FROM fnb_auth.session WHERE id = ANY($1)", [ours]),
  );
  return {
    codes: tenantRows.codes.filter((id) => Object.values(shop.codes).includes(id)).sort(),
    staffSessions: tenantRows.staffSessions.sort(),
    backofficeSessions: backoffice.rows.map((r) => r.id).sort(),
  };
}

const evidenceCounts = () =>
  withClient(database.superuserUrl, async (client) => {
    const counts: Record<string, string> = {};
    for (const table of ["audit_log", "approval_log", "change_log", "applied_command"]) {
      counts[table] = (await client.query(`SELECT count(*) FROM ${table}`)).rows[0].count;
    }
    return counts;
  });

const kept = (shop: SweptShop) => ({
  codes: [shop.codes.live],
  staffSessions: [shop.staffSessions.recent, shop.staffSessions.live].sort(),
  backofficeSessions: [shop.backofficeSessions.recent, shop.backofficeSessions.live].sort(),
});

describe("purging expired pairing codes and sessions", () => {
  let first: SweptShop;
  let second: SweptShop;

  beforeAll(async () => {
    first = await sweptShop();
    second = await sweptShop();
  });

  it("deletes one tenant's expired rows without touching another tenant's", async () => {
    expect(await purgeTenantCodesAndSessions(pool, first.tenantId, CUTOFFS)).toEqual({
      pairingCodes: 1,
      staffSessions: 1,
    });
    const untouched = await remaining(second);
    expect(untouched.codes).toContain(second.codes.expired);
    expect(untouched.staffSessions).toContain(second.staffSessions.old);
  });

  it("deletes only what expired before the cut-offs, in every tenant, and keeps evidence", async () => {
    const evidence = await evidenceCounts();
    const report = await purgeExpiredCodesAndSessions(pool, CUTOFFS);
    expect(report).toMatchObject({ pairingCodes: 1, staffSessions: 1, backofficeSessions: 2 });
    expect(report.tenants).toBe(2);
    expect(await remaining(first)).toEqual(kept(first));
    expect(await remaining(second)).toEqual(kept(second));
    expect(await evidenceCounts()).toEqual(evidence);
  });

  it("finds nothing more on a second run and leaves the rows as they were", async () => {
    const report = await purgeExpiredCodesAndSessions(pool, CUTOFFS);
    expect(report).toEqual({
      pairingCodes: 0,
      staffSessions: 0,
      backofficeSessions: 0,
      tenants: 2,
    });
    expect(await remaining(first)).toEqual(kept(first));
    expect(await remaining(second)).toEqual(kept(second));
  });
});

describe("the cleanup job in the API", () => {
  it("runs a round when the app starts, on the app's clock, and stops with the app", async () => {
    const shop = await sweptShop();
    const clock = new ManualClock(NOW);
    const app = buildApp({ pool, clock });
    const rounds: unknown[] = [];
    const firstRound = new Promise<void>((resolve) => {
      installCleanupJob(app, {
        pool,
        clock,
        settings: { intervalMillis: 3_600_000, sessionRetentionMillis: RETENTION },
        onRound: (report) => {
          rounds.push(report);
          resolve();
        },
        onError: (error) => rounds.push(error),
      });
    });
    await app.ready();
    await firstRound;
    await app.close();
    expect(rounds).toEqual([expect.objectContaining({ pairingCodes: 1, staffSessions: 1 })]);
    expect(await remaining(shop)).toEqual(kept(shop));
  });
});
