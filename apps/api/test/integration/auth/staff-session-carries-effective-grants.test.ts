import { decodeRoleGrants, withTenant } from "@fnb/db";
import { authorize, basisPoints } from "@fnb/domain";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { patchRole } from "../support/role-requests";
import {
  type StaffedShop,
  currentStaff,
  hire,
  staffedShop,
  startShift,
} from "../support/staffed-shop";

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

async function shiftAs(roleId: string): Promise<string> {
  const staffId = await hire(app, shop, "4826", roleId);
  return (await startShift(app, shop.deviceToken, staffId, "4826")).body.staffSessionToken;
}

const lineDiscount = (percent: number) => ({
  key: "line_discount" as const,
  discountRate: basisPoints(percent * 100),
});

describe("the grants of the current staff session", () => {
  it("let the till decide offline what the cashier may do alone", async () => {
    const token = await shiftAs(shop.roleIds.cashier);
    const { grants } = (await currentStaff(app, shop.deviceToken, token)).body;
    const decoded = decodeRoleGrants(grants.permissionKeys, grants.thresholds);
    expect(authorize(lineDiscount(10), decoded)).toBe("allowed");
    expect(authorize(lineDiscount(15), decoded)).toBe("needs_approval");
    expect(authorize({ key: "manage_staff" }, decoded)).toBe("denied");
  });

  it("follow the role as it is now, not as it was when the shift began", async () => {
    const roleId = shop.roleIds.waiter;
    const token = await shiftAs(roleId);
    const widened = { permissionKeys: ["transfer_table", "refund"], thresholds: {} };
    expect((await patchRole(app, shop.managerCookie, roleId, widened)).status).toBe(200);
    expect((await currentStaff(app, shop.deviceToken, token)).body.grants).toEqual(widened);
  });

  it("are refused loudly from a corrupt role rather than handed to the till", async () => {
    const roleId = shop.roleIds.barista;
    const token = await shiftAs(roleId);
    await withTenant(pool, shop.tenantId, (client) =>
      client.query("UPDATE role SET thresholds = $2 WHERE id = $1", [
        roleId,
        { refund: { maxRate: 1 } },
      ]),
    );
    expect(await currentStaff(app, shop.deviceToken, token)).toEqual({
      status: 500,
      body: { code: "API_INTERNAL" },
    });
  });
});
