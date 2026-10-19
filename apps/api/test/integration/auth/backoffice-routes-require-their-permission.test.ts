import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { signedInMember } from "../support/backoffice-accounts";
import { asDevice, issuePairingCode, pairDevice } from "../support/paired-devices";
import { createRole } from "../support/roles";
import { type StaffedShop, staffedShop } from "../support/staffed-shop";

const info = inject("testPostgres");
const DENIED = { status: 403, body: { code: "API_PERMISSION_DENIED" } };

let pool: pg.Pool;
let app: FastifyInstance;
let shop: StaffedShop;
let other: StaffedShop;
/** Members of `shop` holding only the named key, and one holding the manager template. */
let devicesOnly: string;
let staffOnly: string;
let manager: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  shop = await staffedShop(app, pool);
  other = await staffedShop(app, pool);
  const memberHolding = async (key: "manage_devices" | "manage_staff") => {
    const roleId = await createRole(pool, shop.tenantId, [{ key }]);
    return (await signedInMember(app, pool, shop.tenantId, { roleId })).cookie;
  };
  devicesOnly = await memberHolding("manage_devices");
  staffOnly = await memberHolding("manage_staff");
  manager = (await signedInMember(app, pool, shop.tenantId, { roleId: shop.roleIds.manager }))
    .cookie;
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const outcome = async (response: Awaited<ReturnType<FastifyInstance["inject"]>>) => ({
  status: response.statusCode,
  body: response.body === "" ? null : response.json(),
});

const issueCode = async (cookie: string, branchId = shop.branchId) =>
  outcome(await issuePairingCode(app, cookie, branchId));

const revoke = async (cookie: string, deviceId: string) =>
  outcome(
    await app.inject({ method: "POST", url: `/devices/${deviceId}/revoke`, headers: { cookie } }),
  );

const createStaff = async (cookie: string, roleId = shop.roleId, payload: object = {}) =>
  outcome(
    await app.inject({
      method: "POST",
      url: "/staff",
      headers: { cookie },
      payload: { displayName: "Lan", roleId, pin: "4826", branchIds: [shop.branchId], ...payload },
    }),
  );

const staffCount = () =>
  withTenant(pool, shop.tenantId, async (client) => {
    const result = await client.query("SELECT count(*)::int AS n FROM staff");
    return result.rows[0].n as number;
  });

describe("POST /devices/pairing-codes needs manage_devices", () => {
  it("issues a code to a member whose role holds the key", async () => {
    expect((await issueCode(devicesOnly)).status).toBe(201);
    expect((await issueCode(shop.managerCookie)).status).toBe(201);
  });

  it("refuses a member without it, the manager template included", async () => {
    expect(await issueCode(staffOnly)).toEqual(DENIED);
    expect(await issueCode(manager)).toEqual(DENIED);
  });

  it("still answers 404 for a branch of another tenant, to a member who holds the key", async () => {
    expect(await issueCode(other.managerCookie, shop.branchId)).toEqual({
      status: 404,
      body: { code: "API_BRANCH_NOT_FOUND" },
    });
  });

  it("refuses before validating the body, so a refusal says nothing about the request", async () => {
    expect(await issueCode(staffOnly, "not-a-uuid")).toEqual(DENIED);
    expect(await issueCode(devicesOnly, "not-a-uuid")).toEqual({
      status: 400,
      body: { code: "API_INVALID_REQUEST" },
    });
  });
});

describe("POST /devices/:id/revoke needs manage_devices", () => {
  it("revokes for a member whose role holds the key", async () => {
    const till = await pairDevice(app, shop.managerCookie, shop.branchId);
    expect(await revoke(devicesOnly, till.deviceId)).toEqual({ status: 204, body: null });
    expect((await asDevice(app, `Device ${till.deviceToken}`)).status).toBe(401);
  });

  it("refuses a member without it, and the till keeps working", async () => {
    const till = await pairDevice(app, shop.managerCookie, shop.branchId);
    expect(await revoke(staffOnly, till.deviceId)).toEqual(DENIED);
    expect(await revoke(manager, till.deviceId)).toEqual(DENIED);
    expect((await asDevice(app, `Device ${till.deviceToken}`)).status).toBe(200);
  });

  it("still answers 404 for a device of another tenant", async () => {
    expect(await revoke(other.managerCookie, shop.deviceId)).toEqual({
      status: 404,
      body: { code: "API_DEVICE_NOT_FOUND" },
    });
    expect((await asDevice(app, `Device ${shop.deviceToken}`)).status).toBe(200);
  });
});

describe("POST /staff needs manage_staff", () => {
  it("creates staff for a member whose role holds the key", async () => {
    expect((await createStaff(staffOnly)).status).toBe(201);
  });

  it("refuses a member without it and creates nobody", async () => {
    const before = await staffCount();
    expect(await createStaff(devicesOnly)).toEqual(DENIED);
    expect(await createStaff(manager)).toEqual(DENIED);
    expect(await staffCount()).toBe(before);
  });

  it("still answers 404 for a role of another tenant", async () => {
    expect(
      await createStaff(other.managerCookie, shop.roleId, { branchIds: [other.branchId] }),
    ).toEqual({
      status: 404,
      body: { code: "API_ROLE_NOT_FOUND" },
    });
  });
});
