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
  signIn,
  uniqueEmail,
} from "../support/backoffice-accounts";
import { type TenantGraph, seedTenantGraph } from "../support/tenant-graph";

// One person working for two organizations (a consultant, an owner of two companies):
// a session works in exactly one of them, and sees nothing of the other.
const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let a: TenantGraph;
let b: TenantGraph;
let email: string;
let accountId: string;
let inA: string;
let inB: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  a = await seedTenantGraph(pool);
  b = await seedTenantGraph(pool);
  email = uniqueEmail("consultant");
  accountId = await createAccount(pool, { email });
  inA = (await addMember(pool, a.tenantId, accountId, { displayName: "Kế toán A" })).appUserId;
  inB = (await addMember(pool, b.tenantId, accountId, { displayName: "Kế toán B" })).appUserId;
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const me = async (cookie: string) =>
  (await app.inject({ method: "GET", url: "/auth/me", headers: { cookie } })).json();

describe("an account in two organizations", () => {
  it("must say which one to work in, and is offered exactly its own two", async () => {
    const response = await login(app, { email, password: PASSWORD });
    expect(response.statusCode).toBe(409);
    expect(response.headers["set-cookie"]).toBeUndefined();
    const body = response.json();
    expect(body.code).toBe("API_AUTH_ORGANIZATION_REQUIRED");
    expect(body.organizations.map((o: { id: string }) => o.id).sort()).toEqual(
      [a.tenantId, b.tenantId].sort(),
    );
  });

  it("sees only the organization its session works in", async () => {
    const cookieA = await signIn(app, { email, password: PASSWORD, organizationId: a.tenantId });
    const cookieB = await signIn(app, { email, password: PASSWORD, organizationId: b.tenantId });
    expect(await me(cookieA)).toMatchObject({
      organizationId: a.tenantId,
      appUserId: inA,
      displayName: "Kế toán A",
    });
    expect(await me(cookieB)).toMatchObject({
      organizationId: b.tenantId,
      appUserId: inB,
      displayName: "Kế toán B",
    });
  });

  it("cannot open a session in an organization it does not belong to", async () => {
    const stranger = await seedTenantGraph(pool);
    const response = await login(app, {
      email,
      password: PASSWORD,
      organizationId: stranger.tenantId,
    });
    expect({ status: response.statusCode, body: response.json() }).toEqual({
      status: 403,
      body: { code: "API_AUTH_NOT_A_MEMBER" },
    });
  });

  it("an account in one organization needs no choice", async () => {
    const single = uniqueEmail("cashier-lead");
    await addMember(pool, a.tenantId, await createAccount(pool, { email: single }));
    const response = await login(app, { email: single, password: PASSWORD });
    expect({ status: response.statusCode, organizationId: response.json().organizationId }).toEqual(
      {
        status: 200,
        organizationId: a.tenantId,
      },
    );
  });
});
