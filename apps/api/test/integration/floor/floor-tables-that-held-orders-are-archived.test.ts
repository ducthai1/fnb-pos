import { FLOOR_AREA_ENTITY, FLOOR_TABLE_ENTITY } from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { answer, areaWithTables, floorCall, orderSeatedAt, tableBody } from "../support/floor-plan";
import { changesOf, feedAfter } from "../support/menu-feed-probes";
import { type StaffedShop, staffedShop } from "../support/staffed-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let shop: StaffedShop;
let call: ReturnType<typeof floorCall>;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  shop = await staffedShop(app, pool);
  call = floorCall(app, shop.managerCookie);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const listedIds = async (path: "areas" | "tables") => {
  const listed = await answer(call("GET", `/floor/${path}?branchId=${shop.branchId}`));
  return (listed.body as { id: string; archivedAt: string | null }[]).map((row) => ({
    id: row.id,
    archived: row.archivedAt !== null,
  }));
};

const tableOfOrder = (orderId: string) =>
  withTenant(pool, shop.tenantId, async (client) => {
    const found = await client.query("SELECT table_id FROM sales_order WHERE id = $1", [orderId]);
    return found.rows[0].table_id as string;
  });

describe("taking a table off the floor plan", () => {
  it("deletes a table no order ever sat at", async () => {
    const { tableIds } = await areaWithTables(app, shop.managerCookie, shop.branchId, ["B01"]);
    const removed = await answer(call("DELETE", `/floor/tables/${tableIds[0]}?version=1`));
    const again = await answer(call("DELETE", `/floor/tables/${tableIds[0]}?version=1`));
    expect({ removed, again }).toEqual({
      removed: { status: 200, body: { id: tableIds[0], outcome: "deleted" } },
      again: { status: 404, body: { code: "API_FLOOR_TABLE_NOT_FOUND" } },
    });
    expect((await listedIds("tables")).map((row) => row.id)).not.toContain(tableIds[0]);
  });

  it("archives a table orders sat at, which keep pointing at it, and edits it no more", async () => {
    const { areaId, tableIds } = await areaWithTables(app, shop.managerCookie, shop.branchId, [
      "B02",
    ]);
    const tableId = tableIds[0]!;
    const orderId = await orderSeatedAt(pool, shop, tableId, "cancelled");
    const removed = await answer(call("DELETE", `/floor/tables/${tableId}?version=1`));
    const edited = await answer(
      call("PUT", `/floor/tables/${tableId}`, { ...tableBody(areaId), version: 2 }),
    );
    expect({ removed, edited }).toEqual({
      removed: { status: 200, body: { id: tableId, outcome: "archived" } },
      edited: { status: 409, body: { code: "API_FLOOR_ARCHIVED" } },
    });
    expect(await listedIds("tables")).toContainEqual({ id: tableId, archived: true });
    expect(await tableOfOrder(orderId)).toBe(tableId);
  });

  it("refuses while guests are seated at the table", async () => {
    const { tableIds } = await areaWithTables(app, shop.managerCookie, shop.branchId, ["B03"]);
    await orderSeatedAt(pool, shop, tableIds[0]!, "draft");
    const removed = await answer(call("DELETE", `/floor/tables/${tableIds[0]}?version=1`));
    expect(removed).toEqual({ status: 409, body: { code: "API_FLOOR_TABLE_HAS_OPEN_ORDER" } });
    expect(await listedIds("tables")).toContainEqual({ id: tableIds[0], archived: false });
  });
});

describe("taking an area off the floor plan", () => {
  it("deletes an empty area, archives one whose tables are archived", async () => {
    const empty = await areaWithTables(app, shop.managerCookie, shop.branchId, []);
    const used = await areaWithTables(app, shop.managerCookie, shop.branchId, ["B04"]);
    await orderSeatedAt(pool, shop, used.tableIds[0]!, "cancelled");
    await answer(call("DELETE", `/floor/tables/${used.tableIds[0]}?version=1`));
    const deleted = await answer(call("DELETE", `/floor/areas/${empty.areaId}?version=1`));
    const archived = await answer(call("DELETE", `/floor/areas/${used.areaId}?version=1`));
    expect({ deleted, archived }).toEqual({
      deleted: { status: 200, body: { id: empty.areaId, outcome: "deleted" } },
      archived: { status: 200, body: { id: used.areaId, outcome: "archived" } },
    });
    const areas = await listedIds("areas");
    expect(areas.map((row) => row.id)).not.toContain(empty.areaId);
    expect(areas).toContainEqual({ id: used.areaId, archived: true });
  });

  it("tells the tills the archived area and its table are gone: their copies go out empty", async () => {
    const used = await areaWithTables(app, shop.managerCookie, shop.branchId, ["B06"]);
    const tableId = used.tableIds[0]!;
    await orderSeatedAt(pool, shop, tableId, "cancelled");
    const { cursor } = await feedAfter(app, shop.deviceToken);
    await answer(call("DELETE", `/floor/tables/${tableId}?version=1`));
    expect((await answer(call("DELETE", `/floor/areas/${used.areaId}?version=1`))).status).toBe(200);
    const { changes } = await feedAfter(app, shop.deviceToken, cursor);
    const last = (entity: string, id: string) => changesOf(changes, entity, id).at(-1);
    expect(last(FLOOR_TABLE_ENTITY, tableId)).toMatchObject({ snapshot: null });
    expect(last(FLOOR_AREA_ENTITY, used.areaId)).toMatchObject({ snapshot: null });
  });

  it("refuses while a table of the area is still on the floor", async () => {
    const { areaId } = await areaWithTables(app, shop.managerCookie, shop.branchId, ["B05"]);
    const removed = await answer(call("DELETE", `/floor/areas/${areaId}?version=1`));
    expect(removed).toEqual({ status: 409, body: { code: "API_FLOOR_AREA_HAS_TABLES" } });
    expect(await listedIds("areas")).toContainEqual({ id: areaId, archived: false });
  });
});
