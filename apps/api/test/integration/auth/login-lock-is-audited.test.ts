import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { DEFAULT_AUTH_POLICY } from "../../../src/auth/auth-policy";
import { buildApp } from "../../../src/build-app";
import { addMember, createAccount, login, uniqueEmail } from "../support/backoffice-accounts";
import { ManualClock } from "../support/manual-clock";
import { type TenantGraph, seedTenantGraph } from "../support/tenant-graph";

// The login lock stays a fixed 15 minutes, since anyone who knows an owner's email can set
// it off; what changes is that every organization of the account now sees it happen.
const info = inject("testPostgres");
const WRONG = "sai mật khẩu";
const LOCK_MILLIS = DEFAULT_AUTH_POLICY.login.lockMillis;

let pool: pg.Pool;
let clock: ManualClock;
let app: FastifyInstance;
let shop: TenantGraph;
let otherShop: TenantGraph;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  clock = new ManualClock();
  app = buildApp({ pool, clock });
  shop = await seedTenantGraph(pool);
  otherShop = await seedTenantGraph(pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

async function memberOf(graphs: TenantGraph[]): Promise<{ email: string; accountId: string }> {
  const email = uniqueEmail("owner");
  const accountId = await createAccount(pool, { email });
  for (const graph of graphs) await addMember(pool, graph.tenantId, accountId);
  return { email, accountId };
}

const failTimes = async (email: string, times: number) => {
  for (let i = 0; i < times; i++) {
    expect((await login(app, { email, password: WRONG })).statusCode).toBe(401);
  }
};

async function lockEntries(graph: TenantGraph, accountId: string) {
  const { rows } = await withTenant(pool, graph.tenantId, (client) =>
    client.query(
      "SELECT actor_kind, actor_id, action, entity_kind, payload FROM audit_log " +
        "WHERE entity_id = $1 ORDER BY id",
      [accountId],
    ),
  );
  return rows;
}

const entry = (failedAttempts: number, lockedUntil: Date) => ({
  actor_kind: "system",
  actor_id: null,
  action: "account.login_locked",
  entity_kind: "account",
  payload: { failedAttempts, lockedUntil: lockedUntil.toISOString() },
});

describe("a login lock", () => {
  it("is written to the audit trail of every organization of the account, once per lock", async () => {
    const { email, accountId } = await memberOf([shop, otherShop]);
    await failTimes(email, 5);
    const first = new Date(clock.now().getTime() + LOCK_MILLIS);
    clock.advance(LOCK_MILLIS);
    await failTimes(email, 5);
    const second = new Date(clock.now().getTime() + LOCK_MILLIS);
    for (const graph of [shop, otherShop]) {
      expect(await lockEntries(graph, accountId)).toEqual([entry(5, first), entry(5, second)]);
    }
  });

  it("is not audited for failures short of a lock, nor for attempts the lock refuses", async () => {
    const { email, accountId } = await memberOf([shop]);
    await failTimes(email, 4);
    expect(await lockEntries(shop, accountId)).toEqual([]);
    await failTimes(email, 4);
    expect(await lockEntries(shop, accountId)).toHaveLength(1);
  });
});
