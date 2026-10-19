import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { signedInMember } from "../support/backoffice-accounts";
import { asDevice, pairDevice } from "../support/paired-devices";
import { postgresErrorCode } from "../support/postgres-error-code";
import { type TenantGraph, seedTenantGraph } from "../support/tenant-graph";

const info = inject("testPostgres");
const REJECTED = { status: 401, body: { code: "API_DEVICE_UNAUTHENTICATED" } };

let pool: pg.Pool;
let app: FastifyInstance;
let a: TenantGraph;
let b: TenantGraph;
let managerA: string;
let managerB: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  a = await seedTenantGraph(pool);
  b = await seedTenantGraph(pool);
  managerA = (await signedInMember(app, pool, a.tenantId)).cookie;
  managerB = (await signedInMember(app, pool, b.tenantId)).cookie;
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const revoke = async (cookie: string, deviceId: string) => {
  const response = await app.inject({
    method: "POST",
    url: `/devices/${deviceId}/revoke`,
    headers: { cookie },
  });
  return { status: response.statusCode, body: response.body === "" ? null : response.json() };
};

describe("revoking a device", () => {
  it("rejects its token from then on, while another till of the branch keeps working", async () => {
    const revoked = await pairDevice(app, managerA, a.ids.branch, "Quầy 1");
    const kept = await pairDevice(app, managerA, a.ids.branch, "Quầy 2");
    expect((await asDevice(app, `Device ${revoked.deviceToken}`)).status).toBe(200);
    expect(await revoke(managerA, revoked.deviceId)).toEqual({ status: 204, body: null });
    expect(await asDevice(app, `Device ${revoked.deviceToken}`)).toEqual(REJECTED);
    expect((await asDevice(app, `Device ${kept.deviceToken}`)).status).toBe(200);
  });

  it("is idempotent", async () => {
    const { deviceId } = await pairDevice(app, managerA, a.ids.branch);
    expect((await revoke(managerA, deviceId)).status).toBe(204);
    expect((await revoke(managerA, deviceId)).status).toBe(204);
  });

  it("cannot touch another tenant's device, and says so exactly as for an unknown id", async () => {
    const theirs = await pairDevice(app, managerB, b.ids.branch);
    const notFound = { status: 404, body: { code: "API_DEVICE_NOT_FOUND" } };
    expect(await revoke(managerA, theirs.deviceId)).toEqual(notFound);
    expect(await revoke(managerA, newId())).toEqual(notFound);
    expect((await asDevice(app, `Device ${theirs.deviceToken}`)).status).toBe(200);
  });

  it("needs a backoffice session", async () => {
    const { deviceId, deviceToken } = await pairDevice(app, managerA, a.ids.branch);
    expect((await revoke("", deviceId)).status).toBe(401);
    expect((await asDevice(app, `Device ${deviceToken}`)).status).toBe(200);
  });
});

describe("a device token", () => {
  it("is refused when its tenant part names another tenant", async () => {
    const { deviceToken } = await pairDevice(app, managerA, a.ids.branch);
    const secret = deviceToken.slice(deviceToken.indexOf(".") + 1);
    expect(await asDevice(app, `Device ${b.tenantId}.${secret}`)).toEqual(REJECTED);
  });

  it.each([
    ["no Authorization header", undefined],
    ["another scheme", (token: string) => `Bearer ${token}`],
    [
      "a changed secret",
      (token: string) => `Device ${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`,
    ],
    [
      "a tenant part that is not a uuid",
      (token: string) => `Device x${token.slice(token.indexOf("."))}`,
    ],
  ])("is refused with %s", async (_case, present) => {
    const { deviceToken } = await pairDevice(app, managerA, a.ids.branch);
    expect(await asDevice(app, present?.(deviceToken))).toEqual(REJECTED);
  });
});

describe("a pairing code from another tenant's backoffice", () => {
  it("cannot be issued for a branch of another tenant, which looks like no branch at all", async () => {
    const notFound = { status: 404, body: { code: "API_BRANCH_NOT_FOUND" } };
    for (const branchId of [b.ids.branch, newId()]) {
      const response = await app.inject({
        method: "POST",
        url: "/devices/pairing-codes",
        headers: { cookie: managerA },
        payload: { branchId },
      });
      expect({ status: response.statusCode, body: response.json() }).toEqual(notFound);
    }
  });

  it("cannot name an app_user of another tenant as its creator", async () => {
    const code = await withTenant(pool, a.tenantId, (client) =>
      postgresErrorCode(() =>
        client.query(
          "INSERT INTO device_pairing_code (id, tenant_id, branch_id, code_hash, " +
            "created_by_app_user_id, expires_at) VALUES ($1, $2, $3, $4, $5, now())",
          [newId(), a.tenantId, a.ids.branch, "0".repeat(64), b.ids.app_user],
        ),
      ),
    );
    expect(code).toBe("23503");
  });

  it("pairs the till into the code's own tenant only", async () => {
    const { deviceToken, branchId } = await pairDevice(app, managerB, b.ids.branch);
    expect(branchId).toBe(b.ids.branch);
    expect(deviceToken.startsWith(`${b.tenantId}.`)).toBe(true);
  });
});
