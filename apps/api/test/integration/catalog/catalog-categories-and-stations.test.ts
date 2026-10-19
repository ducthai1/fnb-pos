import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { type CatalogShop, catalogShop, expectStatus } from "../support/catalog-shop";
import { pearlMilkTeaDocument } from "../support/pearl-milk-tea-document";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let shop: CatalogShop;
let other: CatalogShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  shop = await catalogShop(app, pool);
  other = await catalogShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const outcome = async (pending: ReturnType<CatalogShop["call"]>) => {
  const response = await pending;
  return { status: response.statusCode, body: response.body === "" ? null : response.json() };
};

describe("categories", () => {
  it("are created, renamed under their version and listed in menu order", async () => {
    const coffee = newId();
    const url = `/catalog/categories/${coffee}`;
    await expectStatus(
      shop.call("PUT", url, { version: null, brandId: shop.brandId, name: "Cà phê", sortOrder: 0 }),
      201,
    );
    const renamed = await outcome(
      shop.call("PUT", url, {
        version: 1,
        brandId: shop.brandId,
        name: "Cà phê phin",
        sortOrder: 0,
      }),
    );
    const stale = await outcome(
      shop.call("PUT", url, { version: 1, brandId: shop.brandId, name: "Cà phê", sortOrder: 0 }),
    );
    // The tenant graph seeds a category of its own; only the two named here are compared.
    const listed = await outcome(shop.call("GET", `/catalog/categories?brandId=${shop.brandId}`));
    listed.body = listed.body.filter((row: { id: string }) =>
      [coffee, shop.categoryId].includes(row.id),
    );
    expect({ renamed, stale, listed }).toEqual({
      renamed: {
        status: 200,
        body: { id: coffee, brandId: shop.brandId, name: "Cà phê phin", sortOrder: 0, version: 2 },
      },
      stale: { status: 409, body: { code: "API_CATALOG_VERSION_CONFLICT" } },
      listed: {
        status: 200,
        body: [
          { id: coffee, brandId: shop.brandId, name: "Cà phê phin", sortOrder: 0, version: 2 },
          { id: shop.categoryId, brandId: shop.brandId, name: "Trà sữa", sortOrder: 1, version: 1 },
        ],
      },
    });
  });

  it("cannot move to another brand", async () => {
    const otherBrand = newId();
    await withTenant(pool, shop.tenant.tenantId, (client) =>
      client.query("INSERT INTO brand (id, tenant_id, name) VALUES ($1, $2, 'Trà Chiều')", [
        otherBrand,
        shop.tenant.tenantId,
      ]),
    );
    const moved = await outcome(
      shop.call("PUT", `/catalog/categories/${shop.categoryId}`, {
        version: 1,
        brandId: otherBrand,
        name: "Trà sữa",
      }),
    );
    expect(moved).toEqual({ status: 400, body: { code: "API_CATALOG_PARENT_CHANGE_NOT_ALLOWED" } });
  });

  it("can be deleted when unused and not while a product uses it", async () => {
    const tea = pearlMilkTeaDocument(shop);
    const used = newId();
    const unused = newId();
    for (const id of [used, unused]) {
      await expectStatus(
        shop.call("PUT", `/catalog/categories/${id}`, {
          version: null,
          brandId: shop.brandId,
          name: "x",
        }),
        201,
      );
    }
    await expectStatus(shop.call("PUT", tea.url, { ...tea.body, categoryId: used }), 201);
    expect([
      await outcome(shop.call("DELETE", `/catalog/categories/${used}`)),
      await outcome(shop.call("DELETE", `/catalog/categories/${unused}`)),
      await outcome(shop.call("DELETE", `/catalog/categories/${unused}`)),
    ]).toEqual([
      { status: 409, body: { code: "API_CATALOG_IN_USE" } },
      { status: 204, body: null },
      { status: 404, body: { code: "API_CATALOG_CATEGORY_NOT_FOUND" } },
    ]);
  });

  it("of another tenant cannot be listed, renamed or deleted", async () => {
    const url = `/catalog/categories/${other.categoryId}`;
    expect([
      await outcome(shop.call("GET", `/catalog/categories?brandId=${other.brandId}`)),
      await outcome(shop.call("PUT", url, { version: 1, brandId: shop.brandId, name: "x" })),
      await outcome(shop.call("DELETE", url)),
    ]).toEqual([
      { status: 404, body: { code: "API_CATALOG_BRAND_NOT_FOUND" } },
      { status: 404, body: { code: "API_CATALOG_CATEGORY_NOT_FOUND" } },
      { status: 404, body: { code: "API_CATALOG_CATEGORY_NOT_FOUND" } },
    ]);
  });
});

describe("stations", () => {
  it("are created per branch, renamed and listed", async () => {
    const kitchen = newId();
    const url = `/catalog/stations/${kitchen}`;
    await expectStatus(
      shop.call("PUT", url, { version: null, branchId: shop.branchId, name: "Bếp" }),
      201,
    );
    await expectStatus(
      shop.call("PUT", url, { version: 1, branchId: shop.branchId, name: "Bếp nóng" }),
      200,
    );
    const listed = await outcome(shop.call("GET", `/catalog/stations?branchId=${shop.branchId}`));
    listed.body = listed.body.filter((row: { id: string }) =>
      [kitchen, shop.stationId].includes(row.id),
    );
    expect(listed).toEqual({
      status: 200,
      body: [
        { id: shop.stationId, branchId: shop.branchId, name: "Bar", version: 1 },
        { id: kitchen, branchId: shop.branchId, name: "Bếp nóng", version: 2 },
      ],
    });
  });

  it("cannot be deleted while a product is routed to it, nor seen by another tenant", async () => {
    const tea = pearlMilkTeaDocument(shop);
    await expectStatus(shop.call("PUT", tea.url, tea.body), 201);
    expect([
      await outcome(shop.call("DELETE", `/catalog/stations/${shop.stationId}`)),
      await outcome(other.call("DELETE", `/catalog/stations/${shop.stationId}`)),
      await outcome(other.call("GET", `/catalog/stations?branchId=${shop.branchId}`)),
      await outcome(
        shop.call("PUT", `/catalog/stations/${newId()}`, {
          version: null,
          branchId: other.branchId,
          name: "x",
        }),
      ),
    ]).toEqual([
      { status: 409, body: { code: "API_CATALOG_IN_USE" } },
      { status: 404, body: { code: "API_CATALOG_STATION_NOT_FOUND" } },
      { status: 404, body: { code: "API_CATALOG_BRANCH_NOT_FOUND" } },
      { status: 404, body: { code: "API_CATALOG_REFERENCE_NOT_FOUND" } },
    ]);
  });
});
