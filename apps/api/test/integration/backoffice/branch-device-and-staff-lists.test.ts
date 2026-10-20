import { branchListSchema, deviceListSchema, staffListSchema } from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { signedInMember } from "../support/backoffice-accounts";
import { ManualClock } from "../support/manual-clock";
import { pairDevice } from "../support/paired-devices";
import { createRole } from "../support/roles";
import { secretKeysIn } from "../support/secret-keys";
import { type StaffedShop, hire, staffedShop } from "../support/staffed-shop";

const info = inject("testPostgres");
const DENIED = { status: 403, body: { code: "API_PERMISSION_DENIED" } };

let pool: pg.Pool;
let app: FastifyInstance;
const clock = new ManualClock();
let shop: StaffedShop;
let other: StaffedShop;
/** Members of `shop`: one holding no key at all, one holding each listing's key. */
let keyless: string;
let devicesOnly: string;
let staffOnly: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock });
  shop = await staffedShop(app, pool);
  other = await staffedShop(app, pool);
  const memberHolding = async (keys: ("manage_devices" | "manage_staff")[]) => {
    const roleId = await createRole(
      pool,
      shop.tenantId,
      keys.map((key) => ({ key })),
    );
    return (await signedInMember(app, pool, shop.tenantId, { roleId })).cookie;
  };
  keyless = await memberHolding([]);
  devicesOnly = await memberHolding(["manage_devices"]);
  staffOnly = await memberHolding(["manage_staff"]);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

async function get(url: string, cookie?: string) {
  const headers = cookie === undefined ? {} : { cookie };
  const response = await app.inject({ method: "GET", url, headers });
  return { status: response.statusCode, body: response.json() };
}

const devicesOf = (branchId: string, cookie = devicesOnly) =>
  get(`/devices?branchId=${branchId}`, cookie);

describe("GET /branches", () => {
  it("lists the organization's branches with their brand to any signed-in member", async () => {
    const { status, body } = await get("/branches", keyless);
    expect(status).toBe(200);
    const { branches } = branchListSchema.parse(body);
    expect(branches.map((branch) => [branch.name, branch.brandName])).toEqual([
      ["Q1", "Phở Sáng"],
      ["Q3", "Phở Sáng"],
    ]);
    expect(branches.map((branch) => branch.id)).toEqual([shop.branchId, shop.otherBranchId]);
  });

  it("shows another organization only its own branches", async () => {
    const { body } = await get("/branches", other.managerCookie);
    const ids = branchListSchema.parse(body).branches.map((branch) => branch.id);
    expect(ids).toEqual([other.branchId, other.otherBranchId]);
  });

  it("refuses a caller without a session", async () => {
    expect(await get("/branches")).toEqual({
      status: 401,
      body: { code: "API_AUTH_UNAUTHENTICATED" },
    });
  });
});

describe("GET /devices?branchId=", () => {
  it("lists the branch's tills only, a live one without a revoked time", async () => {
    const { status, body } = await devicesOf(shop.branchId);
    expect(status).toBe(200);
    const { devices } = deviceListSchema.parse(body);
    expect(devices.map((device) => [device.id, device.name, device.revokedAt])).toEqual([
      [shop.deviceId, "Quầy Q1", null],
    ]);
    expect(devices[0]?.branchId).toBe(shop.branchId);
  });

  it("shows when a revoked till stopped, and keeps listing it", async () => {
    const till = await pairDevice(app, shop.managerCookie, shop.otherBranchId, "Quầy cũ");
    clock.advance(60_000);
    const revoke = `/devices/${till.deviceId}/revoke`;
    const revoked = await app.inject({
      method: "POST",
      url: revoke,
      headers: { cookie: shop.managerCookie },
    });
    expect(revoked.statusCode).toBe(204);
    const { devices } = deviceListSchema.parse((await devicesOf(shop.otherBranchId)).body);
    const listed = devices.find((device) => device.id === till.deviceId);
    expect(listed?.revokedAt).toBe(clock.now().toISOString());
    const live = devices.filter((device) => device.revokedAt === null).map((d) => d.name);
    expect(live).toEqual(["Quầy Q3"]);
  });

  it("answers 404 for a branch of another organization, and shows none of its tills", async () => {
    expect(await devicesOf(other.branchId)).toEqual({
      status: 404,
      body: { code: "API_BRANCH_NOT_FOUND" },
    });
  });

  it("refuses a member without manage_devices before reading the query", async () => {
    expect(await devicesOf(shop.branchId, staffOnly)).toEqual(DENIED);
    expect(await devicesOf(shop.branchId, keyless)).toEqual(DENIED);
    expect(await devicesOf("not-a-uuid", keyless)).toEqual(DENIED);
  });

  it("refuses a branch id that is not one", async () => {
    const invalid = { status: 400, body: { code: "API_INVALID_REQUEST" } };
    expect(await devicesOf("not-a-uuid")).toEqual(invalid);
    expect(await devicesOf(shop.branchId.toUpperCase())).toEqual(invalid);
    expect(await get("/devices", devicesOnly)).toEqual(invalid);
  });
});

describe("GET /staff", () => {
  it("lists every staff member with role and branches, inactive ones too", async () => {
    const lan = await hire(app, shop, "4826");
    const leaver = await hire(app, shop, "7391", shop.roleIds.manager);
    await withTenant(pool, shop.tenantId, (client) =>
      client.query("UPDATE staff SET active = false WHERE id = $1", [leaver]),
    );
    const { status, body } = await get("/staff", staffOnly);
    expect(status).toBe(200);
    const listed = new Map(staffListSchema.parse(body).staff.map((m) => [m.id, m]));
    expect(listed.get(lan)).toEqual({
      id: lan,
      displayName: "Lan",
      roleId: shop.roleId,
      active: true,
      branchIds: [shop.branchId],
    });
    expect(listed.get(leaver)).toMatchObject({ active: false, roleId: shop.roleIds.manager });
  });

  it("shows another organization none of this one's staff", async () => {
    const lan = await hire(app, shop, "5937");
    const { body } = await get("/staff", other.managerCookie);
    expect(staffListSchema.parse(body).staff.map((m) => m.id)).not.toContain(lan);
  });

  it("refuses a member without manage_staff", async () => {
    expect(await get("/staff", devicesOnly)).toEqual(DENIED);
    expect(await get("/staff", keyless)).toEqual(DENIED);
  });
});

describe("what the lists never carry", () => {
  it("names no secret at any depth, though staff have PIN hashes and tills token hashes", async () => {
    await hire(app, shop, "6284");
    const answers = [
      await get("/branches", keyless),
      await devicesOf(shop.branchId),
      await devicesOf(shop.otherBranchId),
      await get("/staff", staffOnly),
    ];
    expect(answers.map((answer) => answer.status)).toEqual([200, 200, 200, 200]);
    expect(answers.flatMap((answer) => secretKeysIn(answer.body))).toEqual([]);
  });

  it("would notice a secret if one slipped in", () => {
    const planted = { staff: [{ id: "x", pinHash: "…" }], devices: [{ token_hash: "…" }] };
    expect(secretKeysIn(planted)).toEqual([".staff.0.pinHash", ".devices.0.token_hash"]);
  });
});
