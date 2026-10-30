import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { type SyncShop, syncShop } from "../support/sync-shop";
import { answer, areaBody, areaWithTables, floorCall, tableBody } from "../support/floor-plan";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  s = await syncShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const CONFLICT = { status: 409, body: { code: "API_FLOOR_VERSION_CONFLICT" } };
const INVALID = { status: 400, body: { code: "API_INVALID_REQUEST" } };

describe("removing a table", () => {
  it("is refused when someone edited it since, and works with the version last read", async () => {
    const call = floorCall(app, s.shop.managerCookie);
    const { areaId, tableIds } = await areaWithTables(app, s.shop.managerCookie, s.shop.branchId, ["V01"]);
    const [tableId] = tableIds as [string];
    expect((await answer(call("PUT", `/floor/tables/${tableId}`, { ...tableBody(areaId, "V01 mới"), version: 1 }))).status).toBe(200);

    expect(await answer(call("DELETE", `/floor/tables/${tableId}?version=1`))).toEqual(CONFLICT);
    expect(await answer(call("DELETE", `/floor/tables/${tableId}`))).toEqual(INVALID);
    expect(await answer(call("DELETE", `/floor/tables/${tableId}?version=abc`))).toEqual(INVALID);
    expect(await answer(call("DELETE", `/floor/tables/${tableId}?version=2`))).toEqual({
      status: 200,
      body: { id: tableId, outcome: "deleted" },
    });
  });
});

describe("removing an area", () => {
  it("is refused when someone edited it since, and works with the version last read", async () => {
    const call = floorCall(app, s.shop.managerCookie);
    const { areaId } = await areaWithTables(app, s.shop.managerCookie, s.shop.branchId, [], "Tầng V");
    expect(
      (await answer(call("PUT", `/floor/areas/${areaId}`, { ...areaBody(s.shop.branchId, "Tầng V2"), version: 1 }))).status,
    ).toBe(200);

    expect(await answer(call("DELETE", `/floor/areas/${areaId}?version=1`))).toEqual(CONFLICT);
    expect(await answer(call("DELETE", `/floor/areas/${areaId}`))).toEqual(INVALID);
    expect((await answer(call("DELETE", `/floor/areas/${areaId}?version=2`))).body).toEqual({
      id: areaId,
      outcome: "deleted",
    });
  });
});
