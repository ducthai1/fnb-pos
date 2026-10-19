import { newId } from "@fnb/db";
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
let tea: ReturnType<typeof pearlMilkTeaDocument>;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  shop = await catalogShop(app, pool);
  other = await catalogShop(app, pool);
  tea = pearlMilkTeaDocument(shop);
  await expectStatus(shop.call("PUT", tea.url, tea.body), 201);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const noFilters = {
  branchId: null,
  channelKey: null,
  validFrom: null,
  validTo: null,
  daysOfWeek: null,
  timeWindow: null,
  priority: 0,
};

type ItemBody = { id: string } & Record<string, unknown>;

/** Grab's price for size L, weekday happy hour on milk tea, a launch week and a menu-wide 5%. */
function grabAndPromotions(): ItemBody[] {
  return [
    {
      ...noFilters,
      id: newId(),
      scope: { kind: "variant", variantId: tea.ids.sizeL },
      channelKey: "grab",
      effect: { kind: "fixed_price", price: 52_000 },
    },
    {
      ...noFilters,
      id: newId(),
      scope: { kind: "category", categoryId: shop.categoryId },
      daysOfWeek: [1, 2, 3, 4, 5],
      timeWindow: { startMinute: 840, endMinute: 1020 },
      effect: { kind: "percent_off", rateBp: 2000, rounding: "half-up" },
    },
    {
      ...noFilters,
      id: newId(),
      scope: { kind: "product", productId: tea.ids.product },
      branchId: shop.branchId,
      validFrom: "2026-11-01T00:00:00.000Z",
      validTo: "2026-11-08T00:00:00.000Z",
      effect: { kind: "percent_off", rateBp: 1000, rounding: "down" },
      priority: 2,
    },
    {
      ...noFilters,
      id: newId(),
      scope: { kind: "global" },
      effect: { kind: "percent_off", rateBp: 500, rounding: "half-even" },
      priority: -1,
    },
  ];
}

const listOf = (items: ItemBody[], version: number | null = null) => ({
  version,
  brandId: shop.brandId,
  name: "Giá Grab và khuyến mãi",
  items,
});
const stored = (body: ReturnType<typeof listOf>, id: string, version: number) => ({
  id,
  version,
  brandId: body.brandId,
  name: body.name,
  items: [...body.items].sort((a, b) => a.id.localeCompare(b.id)),
});

describe("PUT and GET /catalog/price-lists/:id", () => {
  it("stores every item with its scope, filters, schedule and effect, and reads them back", async () => {
    const id = newId();
    const body = listOf(grabAndPromotions());
    await expectStatus(shop.call("PUT", `/catalog/price-lists/${id}`, body), 201);
    const read = await expectStatus(shop.call("GET", `/catalog/price-lists/${id}`), 200);
    expect(read.json()).toEqual(stored(body, id, 1));
  });

  it("replaces the items under the list's version and refuses a stale one", async () => {
    const id = newId();
    const url = `/catalog/price-lists/${id}`;
    const [grab, happyHour] = grabAndPromotions();
    if (!grab || !happyHour) throw new Error("fixture lost an item");
    await expectStatus(shop.call("PUT", url, listOf([grab, happyHour])), 201);
    const changed = listOf([{ ...grab, effect: { kind: "fixed_price", price: 49_000 } }], 1);
    await expectStatus(shop.call("PUT", url, changed), 200);
    const stale = await shop.call("PUT", url, listOf([grab], 1));
    expect([stale.statusCode, stale.json()]).toEqual([
      409,
      { code: "API_CATALOG_VERSION_CONFLICT" },
    ]);
    const read = await expectStatus(shop.call("GET", url), 200);
    expect(read.json()).toEqual(stored(changed, id, 2));
  });

  it.each<[string, (item: ItemBody) => ItemBody]>([
    [
      "DOMAIN_PRICING_FIXED_PRICE_ON_BROAD_SCOPE",
      (item) => ({ ...item, effect: { kind: "fixed_price", price: 1 } }),
    ],
    [
      "DOMAIN_PRICING_INVALID_TIME_WINDOW",
      (item) => ({ ...item, timeWindow: { startMinute: 600, endMinute: 600 } }),
    ],
    ["DOMAIN_PRICING_INVALID_DAYS_OF_WEEK", (item) => ({ ...item, daysOfWeek: [1, 7] })],
    [
      "DOMAIN_PRICING_INVALID_VALIDITY_RANGE",
      (item) => ({ ...item, validFrom: "2026-11-08T00:00:00Z", validTo: "2026-11-01T00:00:00Z" }),
    ],
    [
      "DOMAIN_MONEY_INVALID_RATE",
      (item) => ({ ...item, effect: { kind: "percent_off", rateBp: 10_001, rounding: "up" } }),
    ],
  ])("refuses an item breaking a pricing rule with 400 %s", async (code, broken) => {
    const [, happyHour] = grabAndPromotions();
    if (!happyHour) throw new Error("fixture lost an item");
    const id = newId();
    const response = await shop.call(
      "PUT",
      `/catalog/price-lists/${id}`,
      listOf([broken(happyHour)]),
    );
    expect([response.statusCode, response.json()]).toEqual([400, { code }]);
    expect((await shop.call("GET", `/catalog/price-lists/${id}`)).statusCode).toBe(404);
  });

  it("refuses two items sharing an id", async () => {
    const [grab] = grabAndPromotions();
    if (!grab) throw new Error("fixture lost an item");
    const response = await shop.call(
      "PUT",
      `/catalog/price-lists/${newId()}`,
      listOf([grab, { ...grab, priority: 3 }]),
    );
    expect([response.statusCode, response.json()]).toEqual([
      400,
      { code: "DOMAIN_PRICING_DUPLICATE_PRICE_LIST_ITEM_ID" },
    ]);
  });

  it("refuses an item id already used by another list", async () => {
    const [grab] = grabAndPromotions();
    if (!grab) throw new Error("fixture lost an item");
    await expectStatus(shop.call("PUT", `/catalog/price-lists/${newId()}`, listOf([grab])), 201);
    const response = await shop.call("PUT", `/catalog/price-lists/${newId()}`, listOf([grab]));
    expect([response.statusCode, response.json()]).toEqual([
      409,
      { code: "API_CATALOG_ID_CONFLICT" },
    ]);
  });

  it("keeps lists and scopes inside their tenant", async () => {
    const id = newId();
    await expectStatus(
      shop.call("PUT", `/catalog/price-lists/${id}`, listOf(grabAndPromotions())),
      201,
    );
    const theirs = { ...listOf(grabAndPromotions()), brandId: other.brandId };
    const [read, write] = [
      await other.call("GET", `/catalog/price-lists/${id}`),
      await other.call("PUT", `/catalog/price-lists/${newId()}`, theirs),
    ];
    expect([read.statusCode, read.json(), write.statusCode, write.json()]).toEqual([
      404,
      { code: "API_CATALOG_PRICE_LIST_NOT_FOUND" },
      404,
      { code: "API_CATALOG_REFERENCE_NOT_FOUND" },
    ]);
  });
});
