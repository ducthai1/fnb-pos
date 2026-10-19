import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import {
  PASSWORD,
  addMember,
  createAccount,
  login,
  uniqueEmail,
} from "../support/backoffice-accounts";
import { ManualClock } from "../support/manual-clock";
import { type ObservedSecretCheck, observedSecretCheck } from "../support/observed-secret-check";
import { type TenantGraph, seedTenantGraph } from "../support/tenant-graph";
import { withClient } from "../support/with-client";

// A password check costs about 65 ms. An attempt that skipped it for an unknown or locked
// account would answer that much sooner, and the timing alone would tell which emails
// have an account. Counting the checks pins this without measuring time.
const info = inject("testPostgres");
const WRONG = "sai mật khẩu";

let pool: pg.Pool;
let app: FastifyInstance;
let tenant: TenantGraph;
let check: ObservedSecretCheck;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  check = observedSecretCheck();
  app = buildApp({ pool, clock: new ManualClock(), verifySecret: check.verify });
  tenant = await seedTenantGraph(pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

async function member(): Promise<{ email: string; passwordHash: string }> {
  const email = uniqueEmail("owner");
  const accountId = await createAccount(pool, { email });
  await addMember(pool, tenant.tenantId, accountId);
  const { rows } = await withClient(testConnectionString(info, "owner"), (client) =>
    client.query("SELECT password_hash FROM fnb_auth.account WHERE id = $1", [accountId]),
  );
  return { email, passwordHash: String(rows[0]?.password_hash) };
}

/** The hashes the attempt was checked against, and how it was answered. */
async function checksOf(payload: Record<string, unknown>) {
  const before = check.checkedHashes.length;
  const status = (await login(app, payload)).statusCode;
  return { status, hashes: check.checkedHashes.slice(before) };
}

describe("every login attempt", () => {
  it("checks the password once against the account's own hash", async () => {
    const { email, passwordHash } = await member();
    expect(await checksOf({ email, password: WRONG })).toEqual({
      status: 401,
      hashes: [passwordHash],
    });
  });

  it("still checks a password once for an email that has no account", async () => {
    const { status, hashes } = await checksOf({ email: uniqueEmail("nobody"), password: WRONG });
    expect({ status, checks: hashes.length }).toEqual({ status: 401, checks: 1 });
  });

  it("still checks a password once for a locked account, but never against its hash", async () => {
    const { email, passwordHash } = await member();
    for (let i = 0; i < 5; i++) await checksOf({ email, password: WRONG });
    const { status, hashes } = await checksOf({ email, password: PASSWORD });
    expect({
      status,
      checks: hashes.length,
      againstTheAccount: hashes.includes(passwordHash),
    }).toEqual({ status: 401, checks: 1, againstTheAccount: false });
  });
});
