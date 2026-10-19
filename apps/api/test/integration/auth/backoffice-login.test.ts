import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { DEFAULT_AUTH_POLICY } from "../../../src/auth/auth-policy";
import { buildApp } from "../../../src/build-app";
import {
  PASSWORD,
  addMember,
  cookieOf,
  createAccount,
  login,
  uniqueEmail,
} from "../support/backoffice-accounts";
import { ManualClock } from "../support/manual-clock";
import { type TenantGraph, seedTenantGraph } from "../support/tenant-graph";

const info = inject("testPostgres");
const INVALID = { code: "API_AUTH_INVALID_CREDENTIALS" };
const LOCK_MILLIS = DEFAULT_AUTH_POLICY.login.lockMillis;

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

async function member(): Promise<{ email: string; accountId: string; appUserId: string }> {
  const email = uniqueEmail("owner");
  const accountId = await createAccount(pool, { email });
  const { appUserId } = await addMember(pool, tenant.tenantId, accountId);
  return { email, accountId, appUserId };
}

const failTimes = async (email: string, times: number) => {
  for (let i = 0; i < times; i++) {
    expect((await login(app, { email, password: "sai mật khẩu" })).statusCode).toBe(401);
  }
};

describe("POST /auth/login", () => {
  it("signs in with the right password and sets a host-only, script-proof session cookie", async () => {
    const { email, accountId, appUserId } = await member();
    const response = await login(app, { email: `  ${email.toUpperCase()} `, password: PASSWORD });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ accountId, organizationId: tenant.tenantId, appUserId });
    const cookie = String(response.headers["set-cookie"]);
    expect(cookie).toMatch(/^__Host-fnb_session=[A-Za-z0-9_-]{43};/);
    const attributes = cookie.split("; ").slice(1).sort();
    expect(attributes).toEqual(["HttpOnly", "Max-Age=604800", "Path=/", "SameSite=Lax", "Secure"]);
    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: cookieOf(response) },
    });
    expect(me.json()).toMatchObject({ accountId, appUserId, organizationName: "Công ty Phở Sáng" });
  });

  it("signs in by a Vietnamese phone number however it is typed", async () => {
    const accountId = await createAccount(pool, { phone: "+84987654321" });
    await addMember(pool, tenant.tenantId, accountId);
    for (const phone of ["0987 654 321", "0987.654.321", "+84 987 654 321", "84987654321"]) {
      const response = await login(app, { phone, password: PASSWORD });
      expect({ phone, status: response.statusCode }).toEqual({ phone, status: 200 });
    }
  });

  it("answers a wrong password and an unknown account with the same 401 and no cookie", async () => {
    const { email } = await member();
    const wrong = await login(app, { email, password: "sai mật khẩu" });
    const unknown = await login(app, { email: uniqueEmail("nobody"), password: PASSWORD });
    for (const response of [wrong, unknown]) {
      expect({ status: response.statusCode, body: response.json() }).toEqual({
        status: 401,
        body: INVALID,
      });
      expect(response.headers["set-cookie"]).toBeUndefined();
    }
  });

  it.each([
    ["both an email and a phone", { email: "a@example.test", phone: "0912345678" }],
    ["neither an email nor a phone", {}],
    ["a phone that is not Vietnamese", { phone: "+1 202 555 0100" }],
    ["an email without a domain", { email: "owner" }],
  ])("rejects a request with %s as malformed", async (_case, identifier) => {
    const response = await login(app, { ...identifier, password: PASSWORD });
    expect({ status: response.statusCode, body: response.json() }).toEqual({
      status: 400,
      body: { code: "API_INVALID_REQUEST" },
    });
  });
});

describe("login lockout", () => {
  it("still checks the attempt that reaches the limit, so the right password then succeeds", async () => {
    const { email } = await member();
    await failTimes(email, 4);
    expect((await login(app, { email, password: PASSWORD })).statusCode).toBe(200);
  });

  it("counts only consecutive failures: a success starts the count again", async () => {
    const { email } = await member();
    await failTimes(email, 4);
    expect((await login(app, { email, password: PASSWORD })).statusCode).toBe(200);
    await failTimes(email, 4);
    expect((await login(app, { email, password: PASSWORD })).statusCode).toBe(200);
  });

  it("refuses even the right password after 5 failures, with the same answer as a wrong one", async () => {
    const { email } = await member();
    await failTimes(email, 5);
    const locked = await login(app, { email, password: PASSWORD });
    expect({ status: locked.statusCode, body: locked.json() }).toEqual({
      status: 401,
      body: INVALID,
    });
  });

  it("unlocks exactly when the lock window has passed", async () => {
    const { email } = await member();
    await failTimes(email, 5);
    clock.advance(LOCK_MILLIS - 1);
    expect((await login(app, { email, password: PASSWORD })).statusCode).toBe(401);
    clock.advance(1);
    expect((await login(app, { email, password: PASSWORD })).statusCode).toBe(200);
  });

  it("gives an expired lock a fresh run of attempts instead of locking again at once", async () => {
    const { email } = await member();
    await failTimes(email, 5);
    clock.advance(LOCK_MILLIS);
    await failTimes(email, 4);
    expect((await login(app, { email, password: PASSWORD })).statusCode).toBe(200);
  });
});
