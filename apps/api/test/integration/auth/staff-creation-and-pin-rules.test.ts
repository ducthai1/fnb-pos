import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { type StaffedShop, createStaff, staffedShop } from "../support/staffed-shop";

const info = inject("testPostgres");

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

const outcome = async (body: Parameters<typeof createStaff>[2], at: StaffedShop = shop) => {
  const response = await createStaff(app, at, body);
  return { status: response.statusCode, body: response.json() };
};

describe("POST /staff", () => {
  it("creates a staff member of the given branches, storing only a salted hash of the PIN", async () => {
    const { status, body } = await outcome({
      pin: "4826",
      branchIds: [shop.branchId, shop.otherBranchId],
    });
    expect(status).toBe(201);
    const stored = await withTenant(pool, shop.tenant.tenantId, async (client) => ({
      staff: (
        await client.query(
          "SELECT display_name, role_id, pin_hash, active FROM staff WHERE id = $1",
          [body.staffId],
        )
      ).rows,
      branches: (
        await client.query(
          "SELECT branch_id FROM staff_branch WHERE staff_id = $1 ORDER BY branch_id",
          [body.staffId],
        )
      ).rows.map((r) => r.branch_id),
    }));
    expect(stored.staff).toEqual([
      {
        display_name: "Lan",
        role_id: shop.roleId,
        pin_hash: expect.stringMatching(/^scrypt\$15\$8\$1\$/),
        active: true,
      },
    ]);
    expect(stored.branches).toEqual([shop.branchId, shop.otherBranchId].sort());
  });

  it.each([
    "0000",
    "1111",
    "1234",
    "123456",
    "9876",
    "654321",
    "1212",
    "123123",
    "1990",
    "2580",
    "147258",
  ])("refuses the easily guessed PIN %s", async (pin) => {
    expect(await outcome({ pin })).toEqual({
      status: 400,
      body: { code: "API_STAFF_PIN_TOO_WEAK" },
    });
  });

  it.each(["123", "1234567", "12a4", " 4826", "４８２６", ""])(
    "refuses %j, which is not 4 to 6 digits",
    async (pin) => {
      expect(await outcome({ pin })).toEqual({
        status: 400,
        body: { code: "API_STAFF_PIN_FORMAT" },
      });
    },
  );

  it("cannot give a staff member a role of another tenant", async () => {
    expect(await outcome({ pin: "4826", roleId: other.roleId })).toEqual({
      status: 404,
      body: { code: "API_ROLE_NOT_FOUND" },
    });
  });

  it("cannot place a staff member in a branch of another tenant, nor one that does not exist", async () => {
    for (const branchIds of [[shop.branchId, other.branchId], [newId()]]) {
      expect(await outcome({ pin: "4826", branchIds })).toEqual({
        status: 404,
        body: { code: "API_BRANCH_NOT_FOUND" },
      });
    }
  });

  it("needs a backoffice session", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/staff",
      payload: { displayName: "Lan", roleId: shop.roleId, pin: "4826", branchIds: [shop.branchId] },
    });
    expect(response.statusCode).toBe(401);
  });
});
