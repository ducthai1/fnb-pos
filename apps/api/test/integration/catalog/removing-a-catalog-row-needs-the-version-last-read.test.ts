import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { type CatalogShop, catalogShop, expectStatus } from "../support/catalog-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let shop: CatalogShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  shop = await catalogShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const answer = async (method: "GET" | "DELETE", url: string) => {
  const response = await shop.call(method, url);
  return { status: response.statusCode, body: response.body === "" ? null : response.json() };
};

/** One row of each kind that is removed by DELETE with the version last read. */
const KINDS = [
  {
    name: "category",
    path: "/catalog/categories",
    put: (id: string, version: number | null, name: string) =>
      shop.call("PUT", `/catalog/categories/${id}`, {
        version,
        brandId: shop.brandId,
        name,
        sortOrder: 1,
      }),
    exists: async (id: string) =>
      ((await shop.call("GET", `/catalog/categories?brandId=${shop.brandId}`)).json() as { id: string }[]).some(
        (row) => row.id === id,
      ),
  },
  {
    name: "station",
    path: "/catalog/stations",
    put: (id: string, version: number | null, name: string) =>
      shop.call("PUT", `/catalog/stations/${id}`, { version, branchId: shop.branchId, name }),
    exists: async (id: string) =>
      ((await shop.call("GET", `/catalog/stations?branchId=${shop.branchId}`)).json() as { id: string }[]).some(
        (row) => row.id === id,
      ),
  },
  {
    name: "price list",
    path: "/catalog/price-lists",
    put: (id: string, version: number | null, name: string) =>
      shop.call("PUT", `/catalog/price-lists/${id}`, { version, brandId: shop.brandId, name, items: [] }),
    exists: async (id: string) =>
      ((await shop.call("GET", `/catalog/price-lists?brandId=${shop.brandId}`)).json() as { id: string }[]).some(
        (row) => row.id === id,
      ),
  },
];

describe.each(KINDS)("removing a $name", (kind) => {
  it("is refused with a version conflict when someone edited it since, and the row stays", async () => {
    const id = newId();
    await expectStatus(kind.put(id, null, "Bản đầu"), 201);
    await expectStatus(kind.put(id, 1, "Người khác vừa sửa"), 200);

    expect(await answer("DELETE", `${kind.path}/${id}?version=1`)).toEqual({
      status: 409,
      body: { code: "API_CATALOG_VERSION_CONFLICT" },
    });
    expect(await kind.exists(id)).toBe(true);

    expect((await answer("DELETE", `${kind.path}/${id}?version=2`)).status).toBe(204);
    expect(await kind.exists(id)).toBe(false);
  });

  it("is refused without a version, or with one that is not a version, and the row stays", async () => {
    const id = newId();
    await expectStatus(kind.put(id, null, "Giữ lại"), 201);
    for (const query of ["", "?version=", "?version=0", "?version=-1", "?version=abc", "?version=1.5"]) {
      expect(await answer("DELETE", `${kind.path}/${id}${query}`)).toEqual({
        status: 400,
        body: { code: "API_INVALID_REQUEST" },
      });
    }
    expect(await kind.exists(id)).toBe(true);
  });

  it("answers 404 for a row that is not there, whatever version is named", async () => {
    expect((await answer("DELETE", `${kind.path}/${newId()}?version=7`)).status).toBe(404);
  });
});
