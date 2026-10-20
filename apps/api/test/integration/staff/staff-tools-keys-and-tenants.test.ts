import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { signedInMember } from "../support/backoffice-accounts";
import { createRole } from "../support/roles";
import { staffTools } from "../support/staff-admin-requests";
import { type StaffedShop, hire, staffedShop, startShift } from "../support/staffed-shop";

const info = inject("testPostgres");
const PIN = "4826";
const DENIED = { status: 403, body: { code: "API_PERMISSION_DENIED" } };

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

/** Every staff tool, run against one staff member and one role by a member holding `cookie`. */
const everyTool = (cookie: string, staffId: string, roleId: string) => {
  const tools = staffTools(app, cookie);
  return Promise.all([
    tools.update(staffId, { displayName: "Mai" }),
    tools.deactivate(staffId),
    tools.reactivate(staffId),
    tools.resetPin(staffId, "7391"),
    tools.unlockPin(staffId),
    tools.archiveRole(roleId),
  ]);
};

const unchanged = async (staffId: string) => {
  const row = (await staffTools(app, shop.managerCookie).list()).find((s) => s.id === staffId);
  expect(row).toMatchObject({ displayName: "Lan", active: true });
  expect((await startShift(app, shop.deviceToken, staffId, PIN)).status).toBe(201);
};

describe("the staff tools", () => {
  it("need manage_staff: the manager template, view_reports or manage_settings alone are refused", async () => {
    const staffId = await hire(app, shop, PIN);
    const roleId = await createRole(pool, shop.tenantId, [{ key: "open_drawer" }]);
    const refused = [
      (await signedInMember(app, pool, shop.tenantId, { roleId: shop.roleIds.manager })).cookie,
      (
        await signedInMember(app, pool, shop.tenantId, {
          roleId: await createRole(pool, shop.tenantId, [
            { key: "view_reports" },
            { key: "manage_settings" },
          ]),
        })
      ).cookie,
    ];
    for (const cookie of refused) {
      expect(await everyTool(cookie, staffId, roleId)).toEqual(Array(6).fill(DENIED));
    }
    expect(
      (await app.inject({ method: "POST", url: `/staff/${staffId}/deactivate` })).statusCode,
    ).toBe(401);
    await unchanged(staffId);
    const holder = await signedInMember(app, pool, shop.tenantId, {
      roleId: await createRole(pool, shop.tenantId, [{ key: "manage_staff" }]),
    });
    expect((await staffTools(app, holder.cookie).deactivate(staffId)).status).toBe(204);
  });

  it("find no staff member or role of another organization", async () => {
    const staffId = await hire(app, shop, PIN);
    const roleId = await createRole(pool, shop.tenantId, [{ key: "open_drawer" }]);
    const answers = await everyTool(other.managerCookie, staffId, roleId);
    expect(answers.map((answer) => answer.status)).toEqual([404, 404, 404, 404, 404, 404]);
    expect(answers.map((answer) => (answer.body as { code: string }).code)).toEqual([
      ...Array(5).fill("API_STAFF_NOT_FOUND"),
      "API_ROLE_NOT_FOUND",
    ]);
    await unchanged(staffId);
  });

  it("refuse ids that are not uuids before reading anything", async () => {
    const tools = staffTools(app, shop.managerCookie);
    expect((await tools.deactivate("staff-1")).status).toBe(400);
    expect((await tools.archiveRole("cashier")).status).toBe(400);
  });
});
