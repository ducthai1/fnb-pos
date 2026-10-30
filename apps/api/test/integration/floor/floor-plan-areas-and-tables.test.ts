import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { expectStatus } from "../support/catalog-shop";
import {
  answer,
  areaBody,
  areaWithTables,
  floorCall,
  orderSeatedAt,
  tableBody,
} from "../support/floor-plan";
import { type StaffedShop, staffedShop } from "../support/staffed-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let shop: StaffedShop;
let other: StaffedShop;
let call: ReturnType<typeof floorCall>;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  shop = await staffedShop(app, pool);
  other = await staffedShop(app, pool);
  call = floorCall(app, shop.managerCookie);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("areas", () => {
  it("are created, renamed under their version and listed in floor order", async () => {
    const garden = newId();
    const url = `/floor/areas/${garden}`;
    const created = await answer(call("PUT", url, areaBody(shop.branchId, "Sân vườn", 2)));
    const renamed = await answer(
      call("PUT", url, { ...areaBody(shop.branchId, "Sân thượng", 2), version: 1 }),
    );
    const stale = await answer(call("PUT", url, { ...areaBody(shop.branchId), version: 1 }));
    const recreated = await answer(call("PUT", url, areaBody(shop.branchId)));
    const indoors = await areaWithTables(app, shop.managerCookie, shop.branchId, []);
    const listed = await answer(call("GET", `/floor/areas?branchId=${shop.branchId}`));
    const view = (id: string, name: string, sortOrder: number, version: number) => ({
      id,
      branchId: shop.branchId,
      name,
      sortOrder,
      version,
      archivedAt: null,
    });
    expect({ created, renamed, stale, recreated, listed }).toEqual({
      created: { status: 201, body: view(garden, "Sân vườn", 2, 1) },
      renamed: { status: 200, body: view(garden, "Sân thượng", 2, 2) },
      stale: { status: 409, body: { code: "API_FLOOR_VERSION_CONFLICT" } },
      recreated: { status: 409, body: { code: "API_FLOOR_VERSION_CONFLICT" } },
      listed: {
        status: 200,
        body: [view(indoors.areaId, "Tầng 1", 0, 1), view(garden, "Sân thượng", 2, 2)],
      },
    });
  });

  it("stay in their branch, and are not created in a branch of another tenant", async () => {
    const { areaId } = await areaWithTables(app, shop.managerCookie, shop.branchId, []);
    const moved = await answer(
      call("PUT", `/floor/areas/${areaId}`, { ...areaBody(shop.otherBranchId), version: 1 }),
    );
    const foreign = await answer(call("PUT", `/floor/areas/${newId()}`, areaBody(other.branchId)));
    const foreignList = await answer(call("GET", `/floor/areas?branchId=${other.branchId}`));
    expect({ moved, foreign, foreignList }).toEqual({
      moved: { status: 400, body: { code: "API_FLOOR_BRANCH_CHANGE_NOT_ALLOWED" } },
      foreign: { status: 404, body: { code: "API_FLOOR_BRANCH_NOT_FOUND" } },
      foreignList: { status: 404, body: { code: "API_FLOOR_BRANCH_NOT_FOUND" } },
    });
  });
});

describe("tables", () => {
  it("are placed, moved on the plan and listed by area then sort order", async () => {
    const ground = await areaWithTables(app, shop.managerCookie, shop.otherBranchId, ["B02"]);
    const upstairs = await areaWithTables(app, shop.managerCookie, shop.otherBranchId, [], "Lầu");
    const tableId = newId();
    const url = `/floor/tables/${tableId}`;
    await expectStatus(call("PUT", url, tableBody(ground.areaId, "B01")), 201);
    const round = { shape: "circle", x: 300, y: 20, width: 60, height: 60, seats: 2 };
    const moved = await answer(
      call("PUT", url, { ...tableBody(upstairs.areaId, "B01"), ...round, version: 1 }),
    );
    const listed = await answer(call("GET", `/floor/tables?branchId=${shop.otherBranchId}`));
    expect(moved).toEqual({
      status: 200,
      body: {
        ...tableBody(upstairs.areaId, "B01"),
        ...round,
        id: tableId,
        version: 2,
        archivedAt: null,
      },
    });
    // "Lầu" sorts before "Tầng 1": areas of one sort order are listed by name.
    expect(listed.body).toMatchObject([
      { id: tableId, areaId: upstairs.areaId },
      { id: ground.tableIds[0], areaId: ground.areaId, name: "B02", shape: "rectangle" },
    ]);
  });

  it("move only between areas of their branch, and never into an archived area", async () => {
    const here = await areaWithTables(app, shop.managerCookie, shop.branchId, ["B09"]);
    const there = await areaWithTables(app, shop.managerCookie, shop.otherBranchId, []);
    // An area is archived, not deleted, once a table of it held an order.
    const closed = await areaWithTables(app, shop.managerCookie, shop.branchId, ["B10"]);
    await orderSeatedAt(pool, shop, closed.tableIds[0]!, "cancelled");
    await expectStatus(call("DELETE", `/floor/tables/${closed.tableIds[0]}?version=1`), 200);
    await expectStatus(call("DELETE", `/floor/areas/${closed.areaId}?version=1`), 200);
    const tableUrl = `/floor/tables/${here.tableIds[0]}`;
    const crossBranch = await answer(
      call("PUT", tableUrl, { ...tableBody(there.areaId), version: 1 }),
    );
    const intoArchived = await answer(
      call("PUT", tableUrl, { ...tableBody(closed.areaId), version: 1 }),
    );
    const createdArchived = await answer(
      call("PUT", `/floor/tables/${newId()}`, tableBody(closed.areaId)),
    );
    const unknownArea = await answer(call("PUT", `/floor/tables/${newId()}`, tableBody(newId())));
    const missing = await answer(
      call("PUT", `/floor/tables/${newId()}`, { ...tableBody(here.areaId), version: 3 }),
    );
    expect({ crossBranch, intoArchived, createdArchived, unknownArea, missing }).toEqual({
      crossBranch: { status: 400, body: { code: "API_FLOOR_BRANCH_CHANGE_NOT_ALLOWED" } },
      intoArchived: { status: 409, body: { code: "API_FLOOR_AREA_ARCHIVED" } },
      createdArchived: { status: 409, body: { code: "API_FLOOR_AREA_ARCHIVED" } },
      unknownArea: { status: 404, body: { code: "API_FLOOR_AREA_NOT_FOUND" } },
      missing: { status: 404, body: { code: "API_FLOOR_TABLE_NOT_FOUND" } },
    });
  });

  it("refuses an id another tenant's table has, instead of overwriting that table", async () => {
    const theirs = await areaWithTables(app, other.managerCookie, other.branchId, ["B01"]);
    const ours = await areaWithTables(app, shop.managerCookie, shop.branchId, []);
    const taken = await answer(
      call("PUT", `/floor/tables/${theirs.tableIds[0]}`, tableBody(ours.areaId)),
    );
    const theirList = await answer(
      floorCall(app, other.managerCookie)("GET", `/floor/tables?branchId=${other.branchId}`),
    );
    expect(taken).toEqual({ status: 409, body: { code: "API_FLOOR_ID_CONFLICT" } });
    expect(theirList.body).toMatchObject([{ id: theirs.tableIds[0], areaId: theirs.areaId }]);
  });
});
