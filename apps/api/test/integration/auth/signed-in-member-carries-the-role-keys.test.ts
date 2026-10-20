import { signedInMemberSchema } from "@fnb/contracts";
import { encodeRoleGrants, withTenant } from "@fnb/db";
import { PERMISSION_KEYS, ROLE_TEMPLATES, basisPoints } from "@fnb/domain";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { signedInMember } from "../support/backoffice-accounts";
import { createRole } from "../support/roles";
import { type StaffedShop, staffedShop } from "../support/staffed-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let shop: StaffedShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  shop = await staffedShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

async function keysOf(cookie: string) {
  const response = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
  expect(response.statusCode).toBe(200);
  return signedInMemberSchema.parse(response.json()).permissionKeys;
}

describe("GET /auth/me", () => {
  it("lists every key the owner's role holds, in catalog order", async () => {
    const held = new Set(ROLE_TEMPLATES.owner.grants.map((grant) => grant.key));
    expect(await keysOf(shop.managerCookie)).toEqual(PERMISSION_KEYS.filter((k) => held.has(k)));
  });

  it("lists only the keys of a narrower role, a capped one included", async () => {
    const roleId = await createRole(pool, shop.tenantId, [
      { key: "manage_devices" },
      { key: "line_discount", threshold: { maxRate: basisPoints(1_000) } },
    ]);
    const { cookie } = await signedInMember(app, pool, shop.tenantId, { roleId });
    expect(await keysOf(cookie)).toEqual(["line_discount", "manage_devices"]);
  });

  it("lists no key for a member whose role holds none", async () => {
    const roleId = await createRole(pool, shop.tenantId, []);
    const { cookie } = await signedInMember(app, pool, shop.tenantId, { roleId });
    expect(await keysOf(cookie)).toEqual([]);
  });

  it("reads the role afresh, so a key taken away is gone without signing out", async () => {
    const roleId = await createRole(pool, shop.tenantId, [{ key: "manage_staff" }]);
    const { cookie } = await signedInMember(app, pool, shop.tenantId, { roleId });
    expect(await keysOf(cookie)).toEqual(["manage_staff"]);
    const none = encodeRoleGrants([]);
    await withTenant(pool, shop.tenantId, (client) =>
      client.query("UPDATE role SET permission_keys = $2, thresholds = $3 WHERE id = $1", [
        roleId,
        none.permissionKeys,
        none.thresholds,
      ]),
    );
    expect(await keysOf(cookie)).toEqual([]);
  });
});
