import { newId, withTenant } from "@fnb/db";
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

const happyHour = () => ({
  id: newId(),
  scope: { kind: "global" },
  branchId: null,
  channelKey: null,
  validFrom: null,
  validTo: null,
  daysOfWeek: [1, 2, 3, 4, 5],
  timeWindow: { startMinute: 840, endMinute: 1020 },
  effect: { kind: "percent_off", rateBp: 2000, rounding: "half-up" },
  priority: 0,
});

const save = (id: string, name: string, items: unknown[], version: number | null = null) =>
  shop.call("PUT", `/catalog/price-lists/${id}`, { version, brandId: shop.brandId, name, items });

describe("GET /catalog/price-lists", () => {
  it("lists the brand's lists by name with the number of rules each holds", async () => {
    const [a, b] = [newId(), newId()];
    await expectStatus(save(b, "Giờ vàng Z", [happyHour(), happyHour()]), 201);
    await expectStatus(save(a, "Giá Grab A", []), 201);
    const listed = await expectStatus(shop.call("GET", `/catalog/price-lists?brandId=${shop.brandId}`), 200);
    // The tenant graph seeds a list of its own; only the two made here are compared.
    const mine = (listed.json() as { id: string }[]).filter((row) => [a, b].includes(row.id));
    expect(mine).toEqual([
      { id: a, brandId: shop.brandId, name: "Giá Grab A", version: 1, itemCount: 0 },
      { id: b, brandId: shop.brandId, name: "Giờ vàng Z", version: 1, itemCount: 2 },
    ]);
  });

  it("is empty for a brand with no lists", async () => {
    const brand = newId();
    await withTenant(pool, other.tenant.tenantId, (client) =>
      client.query("INSERT INTO brand (id, tenant_id, name) VALUES ($1, $2, 'Trống')", [brand, other.tenant.tenantId]),
    );
    const empty = await expectStatus(other.call("GET", `/catalog/price-lists?brandId=${brand}`), 200);
    expect(empty.json()).toEqual([]);
  });

  it("refuses a malformed brand id and does not show another tenant's brand", async () => {
    const bad = await shop.call("GET", "/catalog/price-lists?brandId=nope");
    const theirs = await shop.call("GET", `/catalog/price-lists?brandId=${other.brandId}`);
    expect([bad.statusCode, bad.json(), theirs.statusCode, theirs.json()]).toEqual([
      400,
      { code: "API_INVALID_REQUEST" },
      404,
      { code: "API_CATALOG_BRAND_NOT_FOUND" },
    ]);
  });
});

describe("DELETE /catalog/price-lists/:id", () => {
  it("removes the list and its rules, and is not repeatable", async () => {
    const id = newId();
    await expectStatus(save(id, "Hết khuyến mãi", [happyHour()]), 201);
    const first = await shop.call("DELETE", `/catalog/price-lists/${id}?version=1`);
    const read = await shop.call("GET", `/catalog/price-lists/${id}`);
    const second = await shop.call("DELETE", `/catalog/price-lists/${id}?version=1`);
    expect([first.statusCode, read.statusCode, second.statusCode, second.json()]).toEqual([
      204,
      404,
      404,
      { code: "API_CATALOG_PRICE_LIST_NOT_FOUND" },
    ]);
  });

  it("tells the tills of the brand that the list is gone", async () => {
    const id = newId();
    await expectStatus(save(id, "Sẽ xóa", [happyHour()]), 201);
    const feed = async (): Promise<number> =>
      withTenant(pool, shop.tenant.tenantId, async (client) => {
        const rows = await client.query("SELECT count(*)::int AS n FROM change_log WHERE entity_id = $1", [id]);
        return rows.rows[0].n;
      });
    const before = await feed();
    expect(before).toBeGreaterThan(0);
    await expectStatus(shop.call("DELETE", `/catalog/price-lists/${id}?version=1`), 204);
    expect(await feed()).toBeGreaterThan(before);
  });

  it("cannot remove another tenant's list", async () => {
    const id = newId();
    await expectStatus(save(id, "Của tôi", []), 201);
    const theirs = await other.call("DELETE", `/catalog/price-lists/${id}?version=1`);
    const still = await shop.call("GET", `/catalog/price-lists/${id}`);
    expect([theirs.statusCode, still.statusCode]).toEqual([404, 200]);
  });

  it("refuses a malformed id", async () => {
    const bad = await shop.call("DELETE", "/catalog/price-lists/not-a-uuid");
    expect([bad.statusCode, bad.json()]).toEqual([400, { code: "API_INVALID_REQUEST" }]);
  });
});
