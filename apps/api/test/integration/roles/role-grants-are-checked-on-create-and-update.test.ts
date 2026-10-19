import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { signedInMember } from "../support/backoffice-accounts";
import { listRoles, patchRole, postRole } from "../support/role-requests";
import { type StaffedShop, staffedShop } from "../support/staffed-shop";

const info = inject("testPostgres");
const DENIED = { status: 403, body: { code: "API_PERMISSION_DENIED" } };
const UNKNOWN_KEY = { status: 400, body: { code: "API_PERMISSION_UNKNOWN_KEY" } };
const BAD_THRESHOLD = { status: 400, body: { code: "API_PERMISSION_INVALID_THRESHOLD" } };
const MALFORMED = { status: 400, body: { code: "API_INVALID_REQUEST" } };

let pool: pg.Pool;
let app: FastifyInstance;
let shop: StaffedShop;
let other: StaffedShop;
let manager: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  shop = await staffedShop(app, pool);
  other = await staffedShop(app, pool);
  manager = (await signedInMember(app, pool, shop.tenantId, { roleId: shop.roleIds.manager }))
    .cookie;
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const owner = () => shop.managerCookie;
const supervisor = {
  name: "Giám sát",
  permissionKeys: ["refund", "order_discount", "cash_move"],
  thresholds: { order_discount: { maxRate: 2_000 }, cash_move: { maxAmount: "2000000" } },
};
const roleOf = async (id: string) =>
  (await listRoles(app, owner())).body.roles.find((role: { id: string }) => role.id === id);

describe("GET /roles", () => {
  it("lists the shop's own roles, the six templates first", async () => {
    const { status, body } = await listRoles(app, owner());
    expect(status).toBe(200);
    const templates = body.roles.filter((role: { isTemplate: boolean }) => role.isTemplate);
    expect(templates.map((role: { id: string }) => role.id).sort()).toEqual(
      Object.values(shop.roleIds).sort(),
    );
    const cashier = body.roles.find((role: { id: string }) => role.id === shop.roleIds.cashier);
    expect(cashier).toMatchObject({
      name: "Thu ngân",
      thresholds: { line_discount: { maxRate: 1_000 }, cash_move: { maxAmount: "500000" } },
    });
    const ids = new Set(body.roles.map((role: { id: string }) => role.id));
    expect(Object.values(other.roleIds).some((id) => ids.has(id))).toBe(false);
  });

  it("is refused without manage_staff", async () => {
    expect(await listRoles(app, manager)).toEqual(DENIED);
  });
});

describe("POST /roles", () => {
  it("stores the grants and the audit trail names who created it", async () => {
    const { status, body } = await postRole(app, owner(), supervisor);
    expect(status).toBe(201);
    expect(await roleOf(body.roleId)).toEqual({
      id: body.roleId,
      ...supervisor,
      isTemplate: false,
      version: 1,
    });
    const audit = await withTenant(pool, shop.tenantId, async (client) => {
      const result = await client.query(
        "SELECT actor_kind, action FROM audit_log WHERE entity_id = $1",
        [body.roleId],
      );
      return result.rows;
    });
    expect(audit).toEqual([{ actor_kind: "app_user", action: "role.created" }]);
  });

  it("refuses a key outside the catalog", async () => {
    expect(
      await postRole(app, owner(), {
        ...supervisor,
        permissionKeys: [...supervisor.permissionKeys, "order.create"],
      }),
    ).toEqual(UNKNOWN_KEY);
  });

  it.each([
    ["an amount cap as a JSON number", { cash_move: { maxAmount: 2_000_000 } }],
    ["a rate cap as a string", { order_discount: { maxRate: "2000" } }],
    ["a rate cap above 100%", { order_discount: { maxRate: 10_001 } }],
    ["a cap on a key that has none", { refund: { maxRate: 1 } }],
    ["a cap on a key the role does not hold", { line_discount: { maxRate: 1 } }],
  ])("refuses %s", async (_, thresholds) => {
    expect(await postRole(app, owner(), { ...supervisor, thresholds })).toEqual(BAD_THRESHOLD);
  });

  it("refuses grants without their thresholds, so limits are never left out by accident", async () => {
    const withoutThresholds = { name: supervisor.name, permissionKeys: supervisor.permissionKeys };
    expect(await postRole(app, owner(), withoutThresholds)).toEqual(MALFORMED);
  });

  it("is refused without manage_staff", async () => {
    expect(await postRole(app, manager, supervisor)).toEqual(DENIED);
  });
});

describe("PATCH /roles/:id", () => {
  it("renames without touching the grants, and counts the version up", async () => {
    const { roleId } = (await postRole(app, owner(), supervisor)).body;
    const { status, body } = await patchRole(app, owner(), roleId, { name: "Trưởng ca" });
    expect(status).toBe(200);
    expect(body).toEqual({
      id: roleId,
      ...supervisor,
      name: "Trưởng ca",
      isTemplate: false,
      version: 2,
    });
  });

  it("replaces the grants as a whole, template roles included", async () => {
    const grants = {
      permissionKeys: ["line_discount"],
      thresholds: { line_discount: { maxRate: 500 } },
    };
    const { status, body } = await patchRole(app, owner(), shop.roleIds.barista, grants);
    expect(status).toBe(200);
    expect(body).toMatchObject({ ...grants, isTemplate: true });
  });

  it("refuses keys without thresholds, which would silently lift the limits on them", async () => {
    const { roleId } = (await postRole(app, owner(), supervisor)).body;
    expect(await patchRole(app, owner(), roleId, { permissionKeys: ["cash_move"] })).toEqual(
      MALFORMED,
    );
    expect(await roleOf(roleId)).toMatchObject({ thresholds: supervisor.thresholds, version: 1 });
  });

  it("refuses bad grants and leaves the role as it was", async () => {
    const { roleId } = (await postRole(app, owner(), supervisor)).body;
    const unknown = { permissionKeys: ["refund", "payment.take"], thresholds: {} };
    const badCap = { ...supervisor, thresholds: { cash_move: { maxAmount: "-1" } } };
    expect(await patchRole(app, owner(), roleId, unknown)).toEqual(UNKNOWN_KEY);
    expect(await patchRole(app, owner(), roleId, badCap)).toEqual(BAD_THRESHOLD);
    expect(await roleOf(roleId)).toMatchObject({ ...supervisor, version: 1 });
  });

  it("answers 404 for a role of another tenant, and changes nothing there", async () => {
    expect(await patchRole(app, owner(), other.roleIds.waiter, { name: "Bị đổi" })).toEqual({
      status: 404,
      body: { code: "API_ROLE_NOT_FOUND" },
    });
    const theirs = (await listRoles(app, other.managerCookie)).body.roles;
    expect(theirs.find((role: { id: string }) => role.id === other.roleIds.waiter).name).toBe(
      "Phục vụ",
    );
  });

  it("is refused without manage_staff", async () => {
    expect(await patchRole(app, manager, shop.roleIds.waiter, { name: "x" })).toEqual(DENIED);
  });
});
