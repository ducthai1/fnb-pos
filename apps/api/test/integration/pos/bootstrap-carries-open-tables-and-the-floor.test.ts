import {
  FLOOR_AREA_ENTITY,
  FLOOR_TABLE_ENTITY,
  type PosBootstrap,
  posBootstrapSchema,
} from "@fnb/contracts";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { floorCall, tableBody } from "../support/floor-plan";
import { changesOf } from "../support/menu-feed-probes";
import { pairDevice } from "../support/paired-devices";
import { line, orderIdOf, pay, pullAll, pushOne, tillsClock } from "../support/sync-commands";
import { cancel } from "../support/sync-order-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";
import { type ShopFloor, dineIn, shopFloor } from "../support/table-commands";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
let floor: ShopFloor;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: tillsClock() });
  s = await syncShop(app, pool);
  floor = await shopFloor(app, s);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const coffee = () => line(s.menu.coffee.id);

/** What a till of the branch paired just now starts with, as the contract parses it. */
async function newTillBootstrap(): Promise<PosBootstrap> {
  const till = await pairDevice(app, s.shop.managerCookie, s.shop.branchId, "Quầy mới");
  const response = await app.inject({
    method: "GET",
    url: "/pos/bootstrap",
    headers: { authorization: `Device ${till.deviceToken}` },
  });
  expect(response.statusCode).toBe(200);
  return posBootstrapSchema.parse(response.json());
}

describe("a till paired while guests sit at tables", () => {
  it("starts with the branch's open drafts, as the feed sends them, and no closed or other branch's order", async () => {
    const seated = dineIn(s.tillA, [coffee(), coffee()], { tableId: floor.tables.B01 });
    const atTable = await pushOne(app, s.tillA, seated);
    const counter = dineIn(s.tillB, [coffee()], { serviceType: "takeaway" });
    await pushOne(app, s.tillB, counter);
    const paid = dineIn(s.tillA, [coffee()], { serviceType: "takeaway" });
    await pushOne(app, s.tillA, paid);
    await pushOne(app, s.tillA, pay(s.tillA, orderIdOf(paid), 29_000));
    const dropped = dineIn(s.tillA, [coffee()], { tableId: floor.tables.B02 });
    await pushOne(app, s.tillA, dropped);
    await pushOne(app, s.tillA, cancel(s.tillA, orderIdOf(dropped)));
    await pushOne(app, s.otherBranchTill, dineIn(s.otherBranchTill, [coffee()], {}));

    const boot = await newTillBootstrap();
    const open = boot.openOrders ?? [];
    expect(open.map((order) => order.id)).toEqual([orderIdOf(seated), orderIdOf(counter)]);
    expect(open[0]).toEqual(atTable.snapshot);
    expect(open[0]).toMatchObject({ tableId: floor.tables.B01, status: "draft" });
  });

  it("starts with the floor plan of its branch, and none of another branch's", async () => {
    const boot = await newTillBootstrap();
    expect(boot.floor?.areas.map((area) => area.id)).toEqual([floor.areaId]);
    expect(boot.floor?.tables.map((table) => table.name)).toEqual(["B01", "B02", "B03", "B04"]);
    expect(boot.floor?.tables.map((table) => table.id)).not.toContain(floor.otherBranchTable);
  });
});

describe("the floor plan on the tills", () => {
  it("follows the backoffice through the feed: a renamed table, and one taken off the floor", async () => {
    const { cursor } = await pullAll(app, s.tillA);
    const { cursor: elsewhere } = await pullAll(app, s.otherBranchTill);
    const call = floorCall(app, s.shop.managerCookie);
    const renamed = { ...tableBody(floor.areaId, "B03 cửa sổ"), version: 1 };
    expect((await call("PUT", `/floor/tables/${floor.tables.B03}`, renamed)).statusCode).toBe(200);
    expect((await call("DELETE", `/floor/tables/${floor.tables.B04}?version=1`)).statusCode).toBe(200);
    const changes = (await pullAll(app, s.tillA, cursor)).changes;
    expect(changesOf(changes, FLOOR_TABLE_ENTITY, floor.tables.B03).map((c) => c.snapshot)).toEqual(
      [expect.objectContaining({ name: "B03 cửa sổ", version: 2, areaId: floor.areaId })],
    );
    expect(changesOf(changes, FLOOR_TABLE_ENTITY, floor.tables.B04).map((c) => c.snapshot)).toEqual(
      [null],
    );
    const theirs = (await pullAll(app, s.otherBranchTill, elsewhere)).changes;
    expect(changesOf(theirs, FLOOR_TABLE_ENTITY)).toEqual([]);
    expect(changesOf(theirs, FLOOR_AREA_ENTITY)).toEqual([]);
    const boot = await newTillBootstrap();
    expect(boot.floor?.tables.map((table) => table.name)).toEqual(["B01", "B02", "B03 cửa sổ"]);
  });
});
