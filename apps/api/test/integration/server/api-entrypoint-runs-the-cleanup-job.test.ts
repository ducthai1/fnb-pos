import { randomBytes } from "node:crypto";
import { newId, withTenant } from "@fnb/db";
import pg from "pg";
import { afterAll, afterEach, beforeAll, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { hashToken } from "../../../src/security/opaque-token";
import { type ApiProcess, listeningUrl, spawnApi } from "../support/api-process";
import { addMember, createAccount, uniqueEmail } from "../support/backoffice-accounts";
import {
  type ProvisionedScratchDatabase,
  provisionScratchDatabase,
} from "../support/provisioned-scratch-database";
import { staffedShop } from "../support/staffed-shop";

const info = inject("testPostgres");
const spawned: ApiProcess[] = [];
let database: ProvisionedScratchDatabase;
let pool: pg.Pool;
let tenantId: string;

beforeAll(async () => {
  database = await provisionScratchDatabase(info);
  pool = new pg.Pool({ connectionString: database.appUrl });
  const app = buildApp({ pool });
  const shop = await staffedShop(app, pool);
  await app.close();
  tenantId = shop.tenantId;
  const { appUserId } = await addMember(
    pool,
    tenantId,
    await createAccount(pool, { email: uniqueEmail("entrypoint-sweep") }),
  );
  // The process runs on the real clock, so the code expired a minute before this run.
  await withTenant(pool, tenantId, (client) =>
    client.query(
      "INSERT INTO device_pairing_code (id, tenant_id, branch_id, code_hash, " +
        "created_by_app_user_id, expires_at) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        newId(),
        tenantId,
        shop.branchId,
        hashToken(randomBytes(8).toString("hex")),
        appUserId,
        new Date(Date.now() - 60_000),
      ],
    ),
  );
});

afterEach(() => {
  for (const api of spawned.splice(0)) {
    if (api.child.exitCode === null && api.child.signalCode === null) api.child.kill("SIGKILL");
  }
});

afterAll(async () => {
  await pool.end();
  await database.drop();
});

const expiredCodes = () =>
  withTenant(pool, tenantId, async (client) => {
    const result = await client.query("SELECT 1 FROM device_pairing_code WHERE expires_at < now()");
    return result.rowCount;
  });

async function runApi(extra: Record<string, string>): Promise<ApiProcess> {
  const api = spawnApi({
    FNB_ENV: "development",
    FNB_DATABASE_URL: database.appUrl,
    PORT: "0",
    ...extra,
  });
  spawned.push(api);
  await listeningUrl(api);
  return api;
}

it("leaves the rows alone when the job is turned off", async () => {
  const api = await runApi({ FNB_CLEANUP_ENABLED: "false" });
  api.child.kill("SIGTERM");
  expect(await api.exited).toBe(0);
  expect(await expiredCodes()).toBe(1);
  expect(api.output.stdout).not.toContain("cleanup");
});

it("deletes expired codes as the server starts, and says so", async () => {
  const api = await runApi({});
  const deadline = Date.now() + 10_000;
  while (!api.output.stdout.includes("cleanup removed") && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  api.child.kill("SIGTERM");
  expect(await api.exited).toBe(0);
  expect(api.output.stdout).toContain(
    "cleanup removed 1 pairing codes, 0 staff sessions, 0 backoffice sessions",
  );
  expect(await expiredCodes()).toBe(0);
});
