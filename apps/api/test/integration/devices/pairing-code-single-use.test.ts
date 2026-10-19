import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { DEFAULT_AUTH_POLICY } from "../../../src/auth/auth-policy";
import { buildApp } from "../../../src/build-app";
import { hashToken } from "../../../src/security/opaque-token";
import { signedInMember } from "../support/backoffice-accounts";
import { ManualClock } from "../support/manual-clock";
import { asDevice, issuePairingCode, pair } from "../support/paired-devices";
import { type TenantGraph, seedTenantGraph } from "../support/tenant-graph";

const info = inject("testPostgres");
const INVALID = { status: 401, body: { code: "API_DEVICE_PAIRING_CODE_INVALID" } };
const TTL = DEFAULT_AUTH_POLICY.pairingCodeTtlMillis;

let pool: pg.Pool;
let clock: ManualClock;
let app: FastifyInstance;
let tenant: TenantGraph;
let manager: { cookie: string; appUserId: string };

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  clock = new ManualClock();
  app = buildApp({ pool, clock });
  tenant = await seedTenantGraph(pool);
  manager = await signedInMember(app, pool, tenant.tenantId);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const newCode = async (): Promise<string> =>
  (await issuePairingCode(app, manager.cookie, tenant.ids.branch)).json().code;

const outcome = async (code: string) => {
  const response = await pair(app, code);
  return { status: response.statusCode, body: response.json() };
};

describe("issuing a pairing code", () => {
  it("gives an 8-symbol code without look-alike characters, valid for 10 minutes", async () => {
    const response = await issuePairingCode(app, manager.cookie, tenant.ids.branch);
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.code).toMatch(/^[2-9A-HJKMNP-TV-Z]{8}$/);
    expect(body).toEqual({
      code: body.code,
      branchId: tenant.ids.branch,
      expiresAt: new Date(clock.now().getTime() + TTL).toISOString(),
    });
  });

  it("stores only the code's SHA-256, never the code", async () => {
    const code = await newCode();
    const stored = await withTenant(pool, tenant.tenantId, (client) =>
      client.query("SELECT * FROM device_pairing_code WHERE code_hash = $1", [hashToken(code)]),
    );
    expect(stored.rowCount).toBe(1);
    expect(JSON.stringify(stored.rows)).not.toContain(code);
  });

  it("needs a backoffice session", async () => {
    const response = await issuePairingCode(app, "", tenant.ids.branch);
    expect(response.statusCode).toBe(401);
  });
});

describe("pairing a till with a code", () => {
  it("creates a device in the code's branch and hands its token over once", async () => {
    const code = await newCode();
    const response = await pair(
      app,
      `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`,
      "Quầy bar",
    );
    expect(response.statusCode).toBe(201);
    const { deviceId, branchId, deviceToken } = response.json();
    expect(branchId).toBe(tenant.ids.branch);
    expect(deviceToken).toMatch(new RegExp(`^${tenant.tenantId}\\.[A-Za-z0-9_-]{43}$`));
    expect(await asDevice(app, `Device ${deviceToken}`)).toEqual({
      status: 200,
      body: { deviceId, branchId, name: "Quầy bar" },
    });
  });

  it("works once: the same code cannot pair a second till", async () => {
    const code = await newCode();
    expect((await outcome(code)).status).toBe(201);
    expect(await outcome(code)).toEqual(INVALID);
  });

  it("lets exactly one of two tills racing with the same code win", async () => {
    const code = await newCode();
    const results = await Promise.all([outcome(code), outcome(code), outcome(code)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 401, 401]);
  });

  it("works until the moment the code expires, and not after", async () => {
    const early = await newCode();
    const late = await newCode();
    clock.advance(TTL - 1);
    expect((await outcome(early)).status).toBe(201);
    clock.advance(1);
    expect(await outcome(late)).toEqual(INVALID);
  });

  it.each([
    ["a code nobody issued", "ZZZZZZZZ"],
    ["a code with a look-alike character", "ABCD0EFG"],
    ["a code of the wrong length", "ABCDEFG"],
  ])("answers %s exactly like a used or expired one", async (_case, code) => {
    expect(await outcome(code)).toEqual(INVALID);
  });
});
