import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { DEFAULT_AUTH_POLICY } from "../../../src/auth/auth-policy";
import { buildApp } from "../../../src/build-app";
import {
  PASSWORD,
  addMember,
  createAccount,
  login,
  signIn,
  uniqueEmail,
} from "../support/backoffice-accounts";
import { ManualClock } from "../support/manual-clock";
import { type TenantGraph, seedTenantGraph } from "../support/tenant-graph";

const info = inject("testPostgres");
const UNAUTHENTICATED = { status: 401, body: { code: "API_AUTH_UNAUTHENTICATED" } };

let pool: pg.Pool;
let clock: ManualClock;
let app: FastifyInstance;
let tenant: TenantGraph;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  clock = new ManualClock();
  app = buildApp({ pool, clock });
  tenant = await seedTenantGraph(pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

async function memberEmail(): Promise<{ email: string; membershipId: string }> {
  const email = uniqueEmail("manager");
  const { membershipId } = await addMember(
    pool,
    tenant.tenantId,
    await createAccount(pool, { email }),
  );
  return { email, membershipId };
}

async function me(cookie?: string) {
  const headers = cookie === undefined ? {} : { cookie };
  const response = await app.inject({ method: "GET", url: "/auth/me", headers });
  return { status: response.statusCode, body: response.json() };
}

describe("a backoffice session", () => {
  it("is required: no cookie, an unknown token and a tampered token are all 401", async () => {
    const cookie = await signIn(app, { email: (await memberEmail()).email, password: PASSWORD });
    expect(await me()).toEqual(UNAUTHENTICATED);
    expect(await me("__Host-fnb_session=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).toEqual(
      UNAUTHENTICATED,
    );
    expect(await me(`${cookie.slice(0, -1)}${cookie.endsWith("A") ? "B" : "A"}`)).toEqual(
      UNAUTHENTICATED,
    );
    expect((await me(cookie)).status).toBe(200);
  });

  it("works until the moment it expires, and not after", async () => {
    const cookie = await signIn(app, { email: (await memberEmail()).email, password: PASSWORD });
    clock.advance(DEFAULT_AUTH_POLICY.sessionTtlMillis - 1);
    expect((await me(cookie)).status).toBe(200);
    clock.advance(1);
    expect(await me(cookie)).toEqual(UNAUTHENTICATED);
  });

  it("is revoked by logout on the server, while another session of the same account lives on", async () => {
    const { email } = await memberEmail();
    const kept = await signIn(app, { email, password: PASSWORD });
    const ended = await signIn(app, { email, password: PASSWORD });
    const logout = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { cookie: ended },
    });
    expect(logout.statusCode).toBe(204);
    expect(String(logout.headers["set-cookie"])).toMatch(/^__Host-fnb_session=; .*Max-Age=0$/);
    expect(await me(ended)).toEqual(UNAUTHENTICATED);
    expect((await me(kept)).status).toBe(200);
  });

  it("treats logging out again, or without a session, as done", async () => {
    const cookie = await signIn(app, { email: (await memberEmail()).email, password: PASSWORD });
    for (const headers of [{ cookie }, { cookie }, {}]) {
      const response = await app.inject({ method: "POST", url: "/auth/logout", headers });
      expect(response.statusCode).toBe(204);
    }
  });

  it("stops working as soon as the membership is suspended", async () => {
    const { email, membershipId } = await memberEmail();
    const cookie = await signIn(app, { email, password: PASSWORD });
    await withTenant(pool, tenant.tenantId, (client) =>
      client.query("UPDATE membership SET status = 'suspended' WHERE id = $1", [membershipId]),
    );
    expect(await me(cookie)).toEqual(UNAUTHENTICATED);
    const again = await login(app, { email, password: PASSWORD });
    expect({ status: again.statusCode, body: again.json() }).toEqual({
      status: 403,
      body: { code: "API_AUTH_NO_ACTIVE_MEMBERSHIP" },
    });
  });

  it("ends when the membership is removed", async () => {
    const { email, membershipId } = await memberEmail();
    const cookie = await signIn(app, { email, password: PASSWORD });
    await withTenant(pool, tenant.tenantId, (client) =>
      client.query("DELETE FROM membership WHERE id = $1", [membershipId]),
    );
    expect(await me(cookie)).toEqual(UNAUTHENTICATED);
  });
});
