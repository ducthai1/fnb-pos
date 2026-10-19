import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import {
  addMember,
  createAccount,
  signedInMember,
  uniqueEmail,
} from "../support/backoffice-accounts";
import { deleteRole, listRoles, postRole } from "../support/role-requests";
import { type StaffedShop, hire, staffedShop } from "../support/staffed-shop";

const info = inject("testPostgres");
const IN_USE = { status: 409, body: { code: "API_ROLE_IN_USE" } };

let pool: pg.Pool;
let app: FastifyInstance;
let shop: StaffedShop;
let other: StaffedShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  shop = await staffedShop(app, pool);
  other = await staffedShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const owner = () => shop.managerCookie;
const newRole = async () =>
  (await postRole(app, owner(), { name: "Tạm", permissionKeys: ["refund"], thresholds: {} })).body
    .roleId as string;
const listed = async (id: string) =>
  (await listRoles(app, owner())).body.roles.some((role: { id: string }) => role.id === id);

describe("DELETE /roles/:id", () => {
  it("removes a role nobody holds, and the audit trail records it", async () => {
    const roleId = await newRole();
    expect(await deleteRole(app, owner(), roleId)).toEqual({ status: 204, body: null });
    expect(await listed(roleId)).toBe(false);
    const audit = await withTenant(pool, shop.tenantId, async (client) => {
      const result = await client.query(
        "SELECT action FROM audit_log WHERE entity_id = $1 ORDER BY id",
        [roleId],
      );
      return result.rows.map((row) => row.action);
    });
    expect(audit).toEqual(["role.created", "role.deleted"]);
  });

  it("refuses a role a staff member holds", async () => {
    const roleId = await newRole();
    await hire(app, shop, "4826", roleId);
    expect(await deleteRole(app, owner(), roleId)).toEqual(IN_USE);
    expect(await listed(roleId)).toBe(true);
  });

  it("refuses a role a staff member holds even after they left", async () => {
    const roleId = await newRole();
    const staffId = await hire(app, shop, "4826", roleId);
    await withTenant(pool, shop.tenantId, (client) =>
      client.query("UPDATE staff SET active = false WHERE id = $1", [staffId]),
    );
    expect(await deleteRole(app, owner(), roleId)).toEqual(IN_USE);
  });

  it.each(["active", "suspended"] as const)(
    "refuses a role a backoffice member holds (%s)",
    async (status) => {
      const roleId = await newRole();
      const accountId = await createAccount(pool, { email: uniqueEmail("member") });
      await addMember(pool, shop.tenantId, accountId, { roleId, status });
      expect(await deleteRole(app, owner(), roleId)).toEqual(IN_USE);
    },
  );

  it("answers 404 for a role of another tenant, which stays", async () => {
    const theirs = other.roleIds.barista;
    expect(await deleteRole(app, owner(), theirs)).toEqual({
      status: 404,
      body: { code: "API_ROLE_NOT_FOUND" },
    });
    const still = (await listRoles(app, other.managerCookie)).body.roles;
    expect(still.some((role: { id: string }) => role.id === theirs)).toBe(true);
  });

  it("is refused without manage_staff", async () => {
    const roleId = await newRole();
    const { cookie } = await signedInMember(app, pool, shop.tenantId, {
      roleId: shop.roleIds.manager,
    });
    expect(await deleteRole(app, cookie, roleId)).toEqual({
      status: 403,
      body: { code: "API_PERMISSION_DENIED" },
    });
    expect(await listed(roleId)).toBe(true);
  });
});
