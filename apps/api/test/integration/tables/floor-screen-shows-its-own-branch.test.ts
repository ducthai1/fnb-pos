import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { expectStatus } from "../support/catalog-shop";
import { areaWithTables, orderSeatedAt } from "../support/floor-plan";
import { type SyncShop, syncShop } from "../support/sync-shop";
import { type ShopFloor, occupancy, shopFloor } from "../support/table-commands";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
let floor: ShopFloor;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  s = await syncShop(app, pool);
  floor = await shopFloor(app, s);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("the till's floor screen", () => {
  it("lists the tables of its own branch only, each with the status of its own orders", async () => {
    const elsewhere = {
      tenantId: s.shop.tenantId,
      branchId: s.shop.otherBranchId,
      deviceId: s.otherBranchTill.deviceId,
    };
    const seatedThere = await orderSeatedAt(pool, elsewhere, floor.otherBranchTable, "draft");
    const here = await occupancy(app, s.tillA);
    const there = await occupancy(app, s.otherBranchTill);
    expect([...here.keys()].sort()).toEqual(Object.values(floor.tables).sort());
    expect([...there.keys()]).toEqual([floor.otherBranchTable]);
    expect(there.get(floor.otherBranchTable)).toMatchObject({
      name: "B01",
      status: "occupied",
      orderId: seatedThere,
    });
    // The other branch's B01 has guests; this branch's B01 is another table and stays free.
    expect(here.get(floor.tables.B01)).toMatchObject({ status: "free", orderId: null });
  });

  it("leaves out a table taken off the floor plan", async () => {
    const { tableIds } = await areaWithTables(app, s.shop.managerCookie, s.shop.branchId, [
      "X01",
      "X02",
    ]);
    const [kept, removed] = tableIds as [string, string];
    await expectStatus(
      app.inject({
        method: "DELETE",
        url: `/floor/tables/${removed}`,
        headers: { cookie: s.shop.managerCookie },
      }),
      200,
    );
    const listed = await occupancy(app, s.tillA);
    expect([listed.has(kept), listed.has(removed)]).toEqual([true, false]);
  });

  it("answers a till only, not a backoffice member", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/floor/occupancy",
      headers: { cookie: s.shop.managerCookie },
    });
    expect(response.statusCode).toBe(401);
  });
});
