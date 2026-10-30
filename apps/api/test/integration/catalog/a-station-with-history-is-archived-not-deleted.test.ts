import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { changesOf, feedAfter } from "../support/menu-feed-probes";
import { type MilkTeaTillShop, bootstrapOf, milkTeaTillShop } from "../support/milk-tea-till-shop";
import { pearlMilkTeaDocument } from "../support/pearl-milk-tea-document";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let m: MilkTeaTillShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  m = await milkTeaTillShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const call = async (method: "GET" | "PUT" | "POST" | "DELETE", url: string, payload?: object) => {
  const response = await app.inject({
    method,
    url,
    headers: { cookie: m.s.shop.managerCookie },
    ...(payload === undefined ? {} : { payload }),
  });
  return { status: response.statusCode, body: response.body === "" ? null : response.json() };
};

const branchId = () => m.s.shop.branchId;
const stationRow = async (id: string) =>
  ((await call("GET", `/catalog/stations?branchId=${branchId()}`)).body as { id: string }[]).find(
    (row) => row.id === id,
  ) as { id: string; version: number; archivedAt: string | null } | undefined;
const tillStations = async () =>
  (await bootstrapOf(app, m.s.tillA.deviceToken)).menu.stations.map((station) => station.id);

/** A new station, a product on the menu that names it, and the product retired again. */
async function stationOfARetiredProduct() {
  const stationId = newId();
  await call("PUT", `/catalog/stations/${stationId}`, { version: null, branchId: branchId(), name: "Quầy cũ" });
  const product = pearlMilkTeaDocument({ brandId: m.s.brandId, categoryId: m.categoryId, stationId });
  expect((await call("PUT", product.url, product.body)).status).toBe(201);
  return { stationId, product };
}

describe("removing a station", () => {
  it("deletes one nothing ever pointed at", async () => {
    const id = newId();
    await call("PUT", `/catalog/stations/${id}`, { version: null, branchId: branchId(), name: "Tạm" });
    expect((await call("DELETE", `/catalog/stations/${id}?version=1`)).body).toEqual({
      id,
      outcome: "deleted",
      version: 1,
    });
    expect(await stationRow(id)).toBeUndefined();
  });

  it("refuses one that a product on the menu still names, which would then print nowhere", async () => {
    const { stationId } = await stationOfARetiredProduct();
    expect(await call("DELETE", `/catalog/stations/${stationId}?version=1`)).toEqual({
      status: 409,
      body: { code: "API_CATALOG_IN_USE" },
    });
    expect((await stationRow(stationId))?.archivedAt).toBeNull();
    expect(await tillStations()).toContain(stationId);
  });

  it("archives one that history still names: out of the list's use, the tills' copy, and told to the tills", async () => {
    const { stationId, product } = await stationOfARetiredProduct();
    expect((await call("POST", `${product.url}/archive`)).status).toBe(200);
    const start = (await feedAfter(app, m.s.tillA.deviceToken)).cursor;

    expect(await call("DELETE", `/catalog/stations/${stationId}?version=1`)).toEqual({
      status: 200,
      body: { id: stationId, outcome: "archived", version: 2 },
    });
    const archived = await stationRow(stationId);
    expect(archived?.archivedAt).not.toBeNull();
    expect(archived?.version).toBe(2);
    expect(await tillStations()).not.toContain(stationId);
    const sent = changesOf((await feedAfter(app, m.s.tillA.deviceToken, start)).changes, "catalog_station", stationId);
    expect(sent.map((change) => change.snapshot)).toEqual([null]);
  });

  it("puts an archived station back in use, listed and sent to the tills again, on the version seen", async () => {
    const { stationId, product } = await stationOfARetiredProduct();
    await call("POST", `${product.url}/archive`);
    await call("DELETE", `/catalog/stations/${stationId}?version=1`);

    expect(await call("POST", `/catalog/stations/${stationId}/unarchive`, { version: 1 })).toEqual({
      status: 409,
      body: { code: "API_CATALOG_VERSION_CONFLICT" },
    });
    expect(await tillStations()).not.toContain(stationId);
    expect(await call("POST", `/catalog/stations/${stationId}/unarchive`, { version: 2 })).toEqual({
      status: 200,
      body: { id: stationId, version: 3, archivedAt: null },
    });
    expect((await stationRow(stationId))?.archivedAt).toBeNull();
    expect(await tillStations()).toContain(stationId);
    // Already in use: nothing to do, same version.
    expect((await call("POST", `/catalog/stations/${stationId}/unarchive`, { version: 3 })).body).toMatchObject({ version: 3 });
    expect((await call("POST", `/catalog/stations/${newId()}/unarchive`, { version: 1 })).status).toBe(404);
  });
});

describe("a product and a station that is out of use", () => {
  it("cannot be given the station, nor be put back on the menu with it, but a retired one keeps it", async () => {
    const { stationId, product } = await stationOfARetiredProduct();
    await call("POST", `${product.url}/archive`);
    await call("DELETE", `/catalog/stations/${stationId}?version=1`);

    const fresh = pearlMilkTeaDocument({ brandId: m.s.brandId, categoryId: m.categoryId, stationId });
    expect(await call("PUT", fresh.url, fresh.body)).toEqual({
      status: 409,
      body: { code: "API_CATALOG_STATION_ARCHIVED" },
    });
    const stored = (await call("GET", product.url)).body as { version: number; name: string };
    // The retired product may be edited while it keeps the station it had.
    expect((await call("PUT", product.url, { ...product.body, version: stored.version, name: "Trà sữa cũ" })).status).toBe(200);
    const edited = (await call("GET", product.url)).body as { version: number };
    expect(await call("POST", `${product.url}/unarchive`, { version: edited.version })).toEqual({
      status: 409,
      body: { code: "API_CATALOG_STATION_ARCHIVED" },
    });
    await call("POST", `/catalog/stations/${stationId}/unarchive`, { version: 2 });
    expect((await call("POST", `${product.url}/unarchive`, { version: edited.version })).status).toBe(200);
  });
});
