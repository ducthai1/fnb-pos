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

// A locked or unknown account answers exactly like a wrong password, so the count of
// passwords really checked against the account is read from the hash check itself.
const info = inject("testPostgres");
const WRONG = "sai mật khẩu";
const GUESSES = 20;

let pool: pg.Pool;
let app: FastifyInstance;
let tenant: TenantGraph;
let check: ObservedSecretCheck;

beforeAll(async () => {
  // Enough connections that every guess is in flight at once rather than queued.
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app"), max: GUESSES + 5 });
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

const failTimes = async (email: string, times: number) => {
  for (let i = 0; i < times; i++) {
    expect((await login(app, { email, password: WRONG })).statusCode).toBe(401);
  }
};

describe("login attempts sent at the same time", () => {
  it(`check exactly 5 of ${GUESSES} wrong passwords against the account, then refuse the right one`, async () => {
    const { email, passwordHash } = await member();
    const before = check.checkedHashes.length;
    const answers = await Promise.all(
      Array.from({ length: GUESSES }, () => login(app, { email, password: WRONG })),
    );
    expect(new Set(answers.map((a) => a.statusCode))).toEqual(new Set([401]));
    const checks = check.checkedHashes.slice(before);
    expect({
      checks: checks.length,
      againstTheAccount: checks.filter((hash) => hash === passwordHash).length,
    }).toEqual({ checks: GUESSES, againstTheAccount: 5 });
    expect((await login(app, { email, password: PASSWORD })).statusCode).toBe(401);
  });

  it("leave the lock that guesses set while a right password was still being checked", async () => {
    const { email } = await member();
    const held = check.hold(PASSWORD);
    const right = login(app, { email, password: PASSWORD });
    await held.reached;
    // Counted after the right password: the fourth of these reaches the limit and locks.
    await failTimes(email, 4);
    held.release();
    expect((await right).statusCode).toBe(200);
    expect((await login(app, { email, password: PASSWORD })).statusCode).toBe(401);
  });

  it("let a right password that was itself the attempt reaching the limit clear that lock", async () => {
    const { email } = await member();
    await failTimes(email, 4);
    expect((await login(app, { email, password: PASSWORD })).statusCode).toBe(200);
    expect((await login(app, { email, password: PASSWORD })).statusCode).toBe(200);
  });
});
