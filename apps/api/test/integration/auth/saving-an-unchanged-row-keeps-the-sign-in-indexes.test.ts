import { randomBytes } from "node:crypto";
import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import {
  PASSWORD,
  addMember,
  createAccount,
  signIn,
  uniqueEmail,
} from "../support/backoffice-accounts";
import { ManualClock } from "../support/manual-clock";
import { type TenantGraph, seedTenantGraph } from "../support/tenant-graph";
import { withClient } from "../support/with-client";

// Writing a row back with every column, as an ORM save does, names the indexed columns
// without changing them. That must not rebuild the global index rows: rebuilding the
// account index deletes it first, and the delete cascades to the account's sessions.
const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let tenant: TenantGraph;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: new ManualClock() });
  tenant = await seedTenantGraph(pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

async function meStatus(cookie: string): Promise<number> {
  return (await app.inject({ method: "GET", url: "/auth/me", headers: { cookie } })).statusCode;
}

async function signedInMember() {
  const email = uniqueEmail("manager");
  const accountId = await createAccount(pool, { email });
  const { membershipId } = await addMember(pool, tenant.tenantId, accountId);
  return { membershipId, cookie: await signIn(app, { email, password: PASSWORD }) };
}

const asTenant = (sql: string, params: unknown[]) =>
  withTenant(pool, tenant.tenantId, (client) => client.query(sql, params));

describe("a membership saved again", () => {
  it("keeps the member signed in when every column is written back unchanged", async () => {
    const { membershipId, cookie } = await signedInMember();
    await asTenant(
      "UPDATE membership SET account_id = account_id, tenant_id = tenant_id, " +
        "app_user_id = app_user_id, status = 'active' WHERE id = $1",
      [membershipId],
    );
    expect(await meStatus(cookie)).toBe(200);
  });

  it("still ends the sessions when it is moved to another account", async () => {
    const { membershipId, cookie } = await signedInMember();
    const email = uniqueEmail("successor");
    const successor = await createAccount(pool, { email });
    await asTenant("UPDATE membership SET account_id = $2 WHERE id = $1", [
      membershipId,
      successor,
    ]);
    expect(await meStatus(cookie)).toBe(401);
    const successorCookie = await signIn(app, { email, password: PASSWORD });
    expect(await meStatus(successorCookie)).toBe(200);
  });
});

describe("a pairing code saved again", () => {
  const routeVersion = (codeHash: string) =>
    withClient(testConnectionString(info, "owner"), async (client) => {
      const found = await client.query<{ xmin: string }>(
        "SELECT xmin::text FROM fnb_auth.pairing_code_route WHERE code_hash = $1",
        [codeHash],
      );
      return found.rows.map((row) => row.xmin);
    });

  it("leaves its route row untouched when the hash is written back unchanged", async () => {
    const id = tenant.ids.device_pairing_code;
    const { rows } = await asTenant("SELECT code_hash FROM device_pairing_code WHERE id = $1", [
      id,
    ]);
    const codeHash = String(rows[0]?.code_hash);
    const before = await routeVersion(codeHash);
    expect(before).toHaveLength(1);
    await asTenant("UPDATE device_pairing_code SET code_hash = code_hash WHERE id = $1", [id]);
    expect(await routeVersion(codeHash)).toEqual(before);
  });

  it("routes by the new hash only once the hash really changes", async () => {
    const id = tenant.ids.device_pairing_code;
    const { rows } = await asTenant("SELECT code_hash FROM device_pairing_code WHERE id = $1", [
      id,
    ]);
    const oldHash = String(rows[0]?.code_hash);
    const newHash = randomBytes(32).toString("hex");
    await asTenant("UPDATE device_pairing_code SET code_hash = $2 WHERE id = $1", [id, newHash]);
    expect({ old: await routeVersion(oldHash), new: (await routeVersion(newHash)).length }).toEqual(
      { old: [], new: 1 },
    );
  });
});
