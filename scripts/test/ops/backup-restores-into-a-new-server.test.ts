import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildApp } from "@fnb/api/build-app";
import { FakeEInvoiceProvider } from "@fnb/api/fake-einvoice-provider";
import { withTenant } from "@fnb/db";
import {
  type RunningTestPostgres,
  asSuperuser,
  startTestPostgres,
  testConnectionString,
} from "@fnb/db/test-support";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateDevStackLogins } from "../../src/dev-stack/dev-stack-generated-logins";
import { type SampleShop, seedSampleShop } from "../../src/dev-stack/seed/seed-sample-shop";
import { backupFileName } from "../../src/ops/backup-files";
import { findPostgresTool } from "../../src/ops/postgres-client-tools";
import { accessRules, rowCountsOfEveryTable, runOpsCli } from "./drill-support";

const logins = generateDevStackLogins();
// The role the deployment guide creates for backups: reads everything, bypasses RLS.
const BACKUP_ROLE = { user: "fnb_backup", password: randomBytes(18).toString("base64url") };
const RESTORED = "fnb_restored";
let source: RunningTestPostgres;
let target: RunningTestPostgres;
let shop: SampleShop;
let backups: string;

beforeAll(async () => {
  for (const tool of ["pg_dump", "pg_restore"] as const) {
    if (findPostgresTool(tool, process.env) === null) {
      throw new Error(`${tool} not found: install postgresql-client-17 or set FNB_PG_BIN_DIR`);
    }
  }
  [source, target] = await Promise.all([startTestPostgres(), startTestPostgres()]);
  backups = await mkdtemp(join(tmpdir(), "fnb-backups-"));
  await asSuperuser(source.info, "postgres", async (client) => {
    const password = client.escapeLiteral(BACKUP_ROLE.password);
    await client.query(`CREATE ROLE fnb_backup LOGIN BYPASSRLS PASSWORD ${password}`);
    await client.query("GRANT pg_read_all_data TO fnb_backup");
  });
  const pool = new pg.Pool({ connectionString: testConnectionString(source.info, "app") });
  const app = buildApp({
    pool,
    paymentSecretKey: Buffer.from(logins.paymentSecretKey, "base64"),
    einvoiceProviders: [new FakeEInvoiceProvider()],
  });
  shop = await seedSampleShop(app, pool, logins);
  await app.close();
  await pool.end();
});

afterAll(async () => {
  await Promise.all([source?.stop(), target?.stop()]);
  if (backups !== undefined) await rm(backups, { recursive: true, force: true });
});

const sourceUrl = () => testConnectionString(source.info, "superuser");
const restoredUrl = () => testConnectionString(target.info, "superuser", RESTORED);
const restore = (file: string, ...flags: string[]) =>
  runOpsCli("scripts/src/ops/restore-cli.ts", [file, "--database", RESTORED, ...flags], {
    FNB_RESTORE_ADMIN_URL: testConnectionString(target.info, "superuser", "postgres"),
  });

describe("a backup restored on another server", () => {
  let file: string;
  const timings: Record<string, string> = {};

  it("is written with a dated name, older ones rotated, and no password printed", async () => {
    const older = backupFileName(source.info.database, new Date("2026-01-01T00:00:00Z"));
    await writeFile(join(backups, older), "an older backup");
    const started = Date.now();
    const run = await runOpsCli("scripts/src/ops/backup-cli.ts", [], {
      FNB_BACKUP_DATABASE_URL: `postgresql://${BACKUP_ROLE.user}:${BACKUP_ROLE.password}@${source.info.host}:${source.info.port}/${source.info.database}`,
      FNB_BACKUP_DIRECTORY: backups,
      FNB_BACKUP_KEEP: "1",
    });
    expect(run.stderr).toBe("");
    expect(run.exitCode).toBe(0);
    const files = await readdir(backups);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^fnb-fnb_test-\d{8}T\d{6}Z\.dump$/);
    file = join(backups, files[0] ?? "");
    expect(run.stdout).toContain("deleted 1 older backups");
    expect(run.stdout + run.stderr).not.toContain(BACKUP_ROLE.password);
    timings.backup = /in (\d+) ms/.exec(run.stdout)?.[1] ?? "?";
    timings.backupCommand = String(Date.now() - started);
    timings.backupSize = /\(([\d.]+ MB)/.exec(run.stdout)?.[1] ?? "?";
  });

  it("fails, leaving no file behind, as a role row level security binds", async () => {
    const before = await readdir(backups);
    const run = await runOpsCli("scripts/src/ops/backup-cli.ts", [], {
      FNB_BACKUP_DATABASE_URL: testConnectionString(source.info, "owner"),
      FNB_BACKUP_DIRECTORY: backups,
    });
    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("row-level security");
    expect(run.stdout + run.stderr).not.toContain(source.info.owner.password);
    expect(await readdir(backups)).toEqual(before);
  });

  it("restores into a new database with every row of every table", async () => {
    const started = Date.now();
    const run = await restore(file);
    timings.restoreCommand = String(Date.now() - started);
    expect(run.stderr).toBe("");
    expect(run.exitCode).toBe(0);
    expect(run.stdout + run.stderr).not.toContain(target.info.superuser.password);
    timings.restore = /in (\d+) ms/.exec(run.stdout)?.[1] ?? "?";
    const before = await rowCountsOfEveryTable(sourceUrl());
    expect(before["public.product"]).toBeGreaterThan(0);
    expect(await rowCountsOfEveryTable(restoredUrl())).toEqual(before);
    console.log(`restore drill timings (ms): ${JSON.stringify(timings)}`);
  });

  it("keeps row level security, policies and the app role's privileges", async () => {
    expect(await accessRules(restoredUrl())).toEqual(await accessRules(sourceUrl()));
  });

  it("lets the app role see a tenant's rows only inside that tenant", async () => {
    const pool = new pg.Pool({
      connectionString: testConnectionString(target.info, "app", RESTORED),
    });
    try {
      expect((await pool.query("SELECT count(*)::int AS n FROM product")).rows[0].n).toBe(0);
      const inside = await withTenant(pool, shop.tenantId, (client) =>
        client.query("SELECT count(*)::int AS n FROM product"),
      );
      expect(inside.rows[0].n).toBe(shop.productCount);
    } finally {
      await pool.end();
    }
  });

  it("signs the owner in on the restored database", async () => {
    const pool = new pg.Pool({
      connectionString: testConnectionString(target.info, "app", RESTORED),
    });
    const app = buildApp({ pool });
    try {
      const response = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: logins.owner.email, password: logins.owner.password },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().organizationId).toBe(shop.tenantId);
    } finally {
      await app.close();
      await pool.end();
    }
  });

  it("refuses to restore over an existing database unless told to replace it", async () => {
    // The sign-in above added a session: the database is no longer the backup's copy.
    const changed = await rowCountsOfEveryTable(restoredUrl());
    expect(changed).not.toEqual(await rowCountsOfEveryTable(sourceUrl()));
    const refused = await restore(file);
    expect(refused.exitCode).toBe(1);
    expect(refused.stderr).toContain(`database ${RESTORED} already exists`);
    expect(await rowCountsOfEveryTable(restoredUrl())).toEqual(changed);
    const replaced = await restore(file, "--replace-existing");
    expect(replaced.exitCode).toBe(0);
    expect(await rowCountsOfEveryTable(restoredUrl())).toEqual(
      await rowCountsOfEveryTable(sourceUrl()),
    );
  });
});
