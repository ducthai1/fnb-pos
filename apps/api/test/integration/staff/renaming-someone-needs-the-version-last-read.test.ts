import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { signedInMember } from "../support/backoffice-accounts";
import { ManualClock } from "../support/manual-clock";
import { staffTools } from "../support/staff-admin-requests";
import { type StaffedShop, hire, staffedShop } from "../support/staffed-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let shop: StaffedShop;
let tools: ReturnType<typeof staffTools>;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: new ManualClock() });
  shop = await staffedShop(app, pool);
  const owner = await signedInMember(app, pool, shop.tenantId, { roleId: shop.roleIds.owner });
  tools = staffTools(app, owner.cookie);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const versionOf = async (staffId: string) =>
  (await tools.list()).find((member) => member.id === staffId)?.version;
const nameOf = async (staffId: string) =>
  (await tools.list()).find((member) => member.id === staffId)?.displayName;

describe("PATCH /staff/:id", () => {
  it("lists each person's version and moves it on with every change", async () => {
    const staffId = await hire(app, shop, "4826");
    const first = await versionOf(staffId);
    expect(first).toBe(1);
    expect((await tools.update(staffId, { displayName: "Lan A" }, first)).status).toBe(204);
    expect(await versionOf(staffId)).toBe(2);
  });

  it("refuses a rename based on a version that has since moved on, and the newer name stays", async () => {
    const staffId = await hire(app, shop, "5937");
    const read = await versionOf(staffId);
    // Another manager renames them after this one has read the list.
    expect((await tools.update(staffId, { displayName: "Người thứ hai sửa" }, read)).status).toBe(204);

    expect(await tools.update(staffId, { displayName: "Người thứ nhất sửa" }, read)).toEqual({
      status: 409,
      body: { code: "API_STAFF_VERSION_CONFLICT" },
    });
    expect(await nameOf(staffId)).toBe("Người thứ hai sửa");
    expect((await tools.update(staffId, { displayName: "Người thứ nhất sửa" })).status).toBe(204);
  });

  it("counts a lock and an unlock as changes too, so a stale role change is refused after them", async () => {
    const staffId = await hire(app, shop, "6284");
    const read = await versionOf(staffId);
    await tools.deactivate(staffId);
    expect((await tools.update(staffId, { roleId: shop.roleIds.manager }, read)).status).toBe(409);
  });

  it("is refused without a version, with one that is not a version, and changes nothing", async () => {
    const staffId = await hire(app, shop, "7391");
    const before = await nameOf(staffId);
    for (const query of ["", "?version=", "?version=0", "?version=abc"]) {
      const response = await app.inject({
        method: "PATCH",
        url: `/staff/${staffId}${query}`,
        headers: { cookie: (await signedInMember(app, pool, shop.tenantId, { roleId: shop.roleIds.owner })).cookie },
        payload: { displayName: "Không được đổi" },
      });
      expect([response.statusCode, response.json().code]).toEqual([400, "API_INVALID_REQUEST"]);
    }
    expect(await nameOf(staffId)).toBe(before);
  });
});
