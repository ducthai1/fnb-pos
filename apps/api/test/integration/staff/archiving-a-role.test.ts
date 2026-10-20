import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { addMember, createAccount, uniqueEmail } from "../support/backoffice-accounts";
import { createRole } from "../support/roles";
import { auditOf, staffTools } from "../support/staff-admin-requests";
import { type StaffedShop, createStaff, hire, staffedShop } from "../support/staffed-shop";

const info = inject("testPostgres");
const PIN = "4826";

let pool: pg.Pool;
let app: FastifyInstance;
let shop: StaffedShop;
let tools: ReturnType<typeof staffTools>;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  shop = await staffedShop(app, pool);
  tools = staffTools(app, shop.managerCookie);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const freshRole = () => createRole(pool, shop.tenantId, [{ key: "open_drawer" }], "Ca đêm");

const roleOf = async (roleId: string) => {
  const response = await app.inject({
    method: "GET",
    url: "/roles",
    headers: { cookie: shop.managerCookie },
  });
  return (response.json().roles as { id: string; archivedAt: string | null }[]).find(
    (role) => role.id === roleId,
  );
};

describe("archiving a role", () => {
  it("is refused while anyone holds it, naming staff locked out and members as well", async () => {
    const roleId = await freshRole();
    const working = await hire(app, shop, PIN, roleId);
    const lockedOut = await hire(app, shop, "7391", roleId);
    await tools.deactivate(lockedOut);
    const account = await createAccount(pool, { email: uniqueEmail("member") });
    const { membershipId } = await addMember(pool, shop.tenantId, account, { roleId });
    const refused = await tools.archiveRole(roleId);
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({
      code: "API_ROLE_IN_USE",
      members: [{ id: membershipId, status: "active" }],
    });
    const named = (refused.body as { staff: { id: string; active: boolean }[] }).staff;
    expect(named.map((row) => [row.id, row.active]).sort()).toEqual(
      [
        [working, true],
        [lockedOut, false],
      ].sort(),
    );
    expect((await roleOf(roleId))?.archivedAt).toBeNull();
  });

  it("archives a role nobody holds, after which it is given to no one", async () => {
    const roleId = await freshRole();
    const moved = await hire(app, shop, PIN, roleId);
    expect((await tools.update(moved, { roleId: shop.roleId })).status).toBe(204);
    const archived = await tools.archiveRole(roleId);
    expect(archived.status).toBe(200);
    expect(archived.body).toMatchObject({ id: roleId, archivedAt: expect.any(String) });
    expect((await roleOf(roleId))?.archivedAt).toEqual(expect.any(String));
    expect((await auditOf(pool, shop.tenantId, roleId)).map((row) => row.action)).toContain(
      "role.archived",
    );
    const archivedRole = { status: 409, body: { code: "API_ROLE_ARCHIVED" } };
    const hired = await createStaff(app, shop, { pin: PIN, roleId });
    expect([hired.statusCode, hired.json()]).toEqual([409, archivedRole.body]);
    expect(await tools.update(moved, { roleId })).toEqual(archivedRole);
    expect(await tools.archiveRole(roleId)).toEqual(archivedRole);
  });

  it("answers 404 for a role that does not exist", async () => {
    expect(await tools.archiveRole(shop.deviceId)).toEqual({
      status: 404,
      body: { code: "API_ROLE_NOT_FOUND" },
    });
  });
});
