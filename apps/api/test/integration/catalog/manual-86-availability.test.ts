import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { type CatalogShop, catalogShop, expectStatus } from "../support/catalog-shop";
import { ManualClock } from "../support/manual-clock";
import { pearlMilkTeaDocument } from "../support/pearl-milk-tea-document";

const info = inject("testPostgres");
const HOUR = 60 * 60_000;

let pool: pg.Pool;
let app: FastifyInstance;
let clock: ManualClock;
let shop: CatalogShop;
let other: CatalogShop;
let secondBranch: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  clock = new ManualClock();
  app = buildApp({ pool, clock });
  shop = await catalogShop(app, pool);
  other = await catalogShop(app, pool);
  secondBranch = newId();
  await withTenant(pool, shop.tenant.tenantId, (client) =>
    client.query("INSERT INTO branch (id, tenant_id, brand_id, name) VALUES ($1, $2, $3, 'Q3')", [
      secondBranch,
      shop.tenant.tenantId,
      shop.brandId,
    ]),
  );
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

async function newMilkTea(): Promise<string> {
  const tea = pearlMilkTeaDocument(shop);
  await expectStatus(shop.call("PUT", tea.url, tea.body), 201);
  return tea.ids.product;
}

const set = (body: Record<string, unknown>, at: CatalogShop = shop) =>
  at.call("PUT", "/catalog/availability", { branchId: shop.branchId, ...body });
const offAt = async (branchId: string, productId: string) => {
  const response = await expectStatus(
    shop.call("GET", `/catalog/availability?branchId=${branchId}`),
    200,
  );
  return response.json().filter((entry: { productId: string }) => entry.productId === productId);
};
const inHours = (hours: number) => new Date(clock.now().getTime() + hours * HOUR).toISOString();

describe("a manual 86", () => {
  it("takes a product off at one branch until the given time, then it is back on its own", async () => {
    const productId = await newMilkTea();
    const until = inHours(2);
    await expectStatus(set({ productId, available: false, unavailableUntil: until }), 200);
    expect(await offAt(shop.branchId, productId)).toEqual([
      { productId, channelKey: null, unavailableUntil: until },
    ]);
    expect(await offAt(secondBranch, productId)).toEqual([]);
    clock.advance(2 * HOUR - 1);
    expect(await offAt(shop.branchId, productId)).toHaveLength(1);
    clock.advance(1);
    expect(await offAt(shop.branchId, productId)).toEqual([]);
  });

  it("switches one channel and all channels independently", async () => {
    const productId = await newMilkTea();
    await expectStatus(set({ productId, channelKey: "grab", available: false }), 200);
    await expectStatus(set({ productId, available: false }), 200);
    expect(await offAt(shop.branchId, productId)).toEqual([
      { productId, channelKey: null, unavailableUntil: null },
      { productId, channelKey: "grab", unavailableUntil: null },
    ]);
    await expectStatus(set({ productId, available: true }), 200);
    expect(await offAt(shop.branchId, productId)).toEqual([
      { productId, channelKey: "grab", unavailableUntil: null },
    ]);
    await expectStatus(set({ productId, channelKey: "grab", available: true }), 200);
    expect(await offAt(shop.branchId, productId)).toEqual([]);
  });

  it("keeps one entry per product, branch and channel, moving its time when set again", async () => {
    const productId = await newMilkTea();
    await expectStatus(set({ productId, available: false, unavailableUntil: inHours(1) }), 200);
    const later = inHours(5);
    await expectStatus(set({ productId, available: false, unavailableUntil: later }), 200);
    expect(await offAt(shop.branchId, productId)).toEqual([
      { productId, channelKey: null, unavailableUntil: later },
    ]);
  });

  it.each([0, -1])(
    "refuses an end %i hours from now, which would never take effect",
    async (hours) => {
      const productId = await newMilkTea();
      const response = await set({ productId, available: false, unavailableUntil: inHours(hours) });
      expect([response.statusCode, response.json()]).toEqual([
        400,
        { code: "API_CATALOG_UNAVAILABLE_UNTIL_NOT_IN_FUTURE" },
      ]);
    },
  );

  it("refuses an end time on a product being put back", async () => {
    const productId = await newMilkTea();
    const response = await set({ productId, available: true, unavailableUntil: inHours(1) });
    expect([response.statusCode, response.json()]).toEqual([400, { code: "API_INVALID_REQUEST" }]);
  });

  it("cannot touch another tenant's product or branch", async () => {
    const productId = await newMilkTea();
    const notFound = { code: "API_CATALOG_REFERENCE_NOT_FOUND" };
    const theirBranch = await set({ productId, branchId: other.branchId, available: false });
    const theirProduct = await set(
      { productId, branchId: other.branchId, available: false },
      other,
    );
    const theirList = await other.call("GET", `/catalog/availability?branchId=${shop.branchId}`);
    expect([
      [theirBranch.statusCode, theirBranch.json()],
      [theirProduct.statusCode, theirProduct.json()],
      [theirList.statusCode, theirList.json()],
    ]).toEqual([
      [404, notFound],
      [404, notFound],
      [404, { code: "API_CATALOG_BRANCH_NOT_FOUND" }],
    ]);
    expect(await offAt(shop.branchId, productId)).toEqual([]);
  });
});
