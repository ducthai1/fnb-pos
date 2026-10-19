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

type MilkTea = ReturnType<typeof pearlMilkTeaDocument>;
const outcome = async (pending: ReturnType<CatalogShop["call"]>) => {
  const response = await pending;
  return { status: response.statusCode, body: response.json() };
};

describe("a product configuration the POS could not sell", () => {
  const groupAt = (tea: MilkTea, index: number) => {
    const group = tea.body.modifierGroups[index];
    if (!group) throw new Error("fixture lost a group");
    return group;
  };
  const withGroup = (tea: MilkTea, index: number, change: Record<string, unknown>) => ({
    ...tea.body,
    modifierGroups: tea.body.modifierGroups.map((group, at) =>
      at === index ? { ...group, ...change } : group,
    ),
  });

  it.each<[string, (tea: MilkTea) => unknown]>([
    [
      "DOMAIN_CATALOG_VARIANT_RULE_FOR_UNKNOWN_VARIANT",
      (tea) => withGroup(tea, 2, { variantRules: { [newId()]: { maxSelect: 5 } } }),
    ],
    ["DOMAIN_CATALOG_MIN_SELECT_ABOVE_MAX_SELECT", (tea) => withGroup(tea, 2, { minSelect: 4 })],
    [
      "DOMAIN_CATALOG_UNSATISFIABLE_MODIFIER_GROUP",
      (tea) => withGroup(tea, 0, { minSelect: 6, maxSelect: 6 }),
    ],
    [
      "DOMAIN_CATALOG_NEGATIVE_PRICE_DELTA",
      (tea) =>
        withGroup(tea, 2, {
          options: [{ id: newId(), name: "Giảm giá", priceDelta: -1_000, maxQuantity: null }],
        }),
    ],
    [
      "DOMAIN_CATALOG_DUPLICATE_OPTION_ID",
      (tea) =>
        withGroup(tea, 2, { options: [...groupAt(tea, 2).options, groupAt(tea, 2).options[0]] }),
    ],
    ["DOMAIN_CATALOG_NEGATIVE_PRODUCT_PRICE", (tea) => ({ ...tea.body, basePrice: -1 })],
    ["DOMAIN_CATALOG_COMBO_DEFINITION_MISSING", (tea) => ({ ...tea.body, kind: "combo" })],
    ["DOMAIN_PRICING_MISSING_BASE_PRICE", (tea) => ({ ...tea.body, basePrice: null })],
    ["DOMAIN_MONEY_INVALID_RATE", (tea) => ({ ...tea.body, taxRateBp: 10_001 })],
  ])("is refused with 400 %s and nothing is stored", async (code, broken) => {
    const tea = pearlMilkTeaDocument(shop);
    expect(await outcome(shop.call("PUT", tea.url, broken(tea)))).toEqual({
      status: 400,
      body: { code },
    });
    expect((await shop.call("GET", tea.url)).statusCode).toBe(404);
  });

  it.each<[string, (tea: MilkTea) => unknown]>([
    ["a missing name", (tea) => ({ ...tea.body, name: undefined })],
    ["a blank name", (tea) => ({ ...tea.body, name: "   " })],
    ["a fractional price", (tea) => ({ ...tea.body, basePrice: 35_000.5 })],
    ["an unknown field", (tea) => ({ ...tea.body, discount: 10 })],
    [
      "a variant id that is not a uuid",
      (tea) => ({ ...tea.body, variants: [{ id: "m", name: "M" }] }),
    ],
  ])("is refused with the generic 400 for %s", async (_, broken) => {
    const tea = pearlMilkTeaDocument(shop);
    expect(await outcome(shop.call("PUT", tea.url, broken(tea)))).toEqual({
      status: 400,
      body: { code: "API_INVALID_REQUEST" },
    });
  });

  it("refuses a product id that is not a uuid", async () => {
    const response = await shop.call("GET", "/catalog/products/milk-tea");
    expect(response.statusCode).toBe(400);
  });
});

describe("ids and references across products and tenants", () => {
  it("refuses taking over a variant id of another product", async () => {
    const first = pearlMilkTeaDocument(shop);
    await expectStatus(shop.call("PUT", first.url, first.body), 201);
    const second = pearlMilkTeaDocument(shop);
    const body = { ...second.body, variants: [{ id: first.ids.sizeL, name: "L", price: 1 }] };
    const sansRules = { ...body, modifierGroups: body.modifierGroups.slice(0, 2) };
    expect(await outcome(shop.call("PUT", second.url, sansRules))).toEqual({
      status: 409,
      body: { code: "API_CATALOG_ID_CONFLICT" },
    });
  });

  it("shows another tenant's product to nobody else: read, replace and archive answer 404", async () => {
    const theirs = pearlMilkTeaDocument(other);
    await expectStatus(other.call("PUT", theirs.url, theirs.body), 201);
    const asUs = { ...theirs.body, brandId: shop.brandId, categoryId: shop.categoryId };
    expect([
      await outcome(shop.call("GET", theirs.url)),
      await outcome(
        shop.call("PUT", theirs.url, { ...asUs, stationId: shop.stationId, version: 1 }),
      ),
      await outcome(shop.call("POST", `${theirs.url}/archive`)),
    ]).toEqual(
      [1, 2, 3].map(() => ({ status: 404, body: { code: "API_CATALOG_PRODUCT_NOT_FOUND" } })),
    );
    expect((await other.call("GET", theirs.url)).json()).toMatchObject({ version: 1 });
  });

  it("refuses another tenant's brand, category, station or id", async () => {
    const tea = pearlMilkTeaDocument(shop);
    const theirs = pearlMilkTeaDocument(other);
    await expectStatus(other.call("PUT", theirs.url, theirs.body), 201);
    const notFound = { status: 404, body: { code: "API_CATALOG_REFERENCE_NOT_FOUND" } };
    expect([
      await outcome(
        shop.call("PUT", tea.url, { ...tea.body, brandId: other.brandId, categoryId: null }),
      ),
      await outcome(shop.call("PUT", tea.url, { ...tea.body, categoryId: other.categoryId })),
      await outcome(shop.call("PUT", tea.url, { ...tea.body, stationId: other.stationId })),
      await outcome(shop.call("PUT", theirs.url, { ...tea.body })),
      await outcome(shop.call("GET", `/catalog/products?brandId=${other.brandId}`)),
    ]).toEqual([
      notFound,
      notFound,
      notFound,
      { status: 409, body: { code: "API_CATALOG_ID_CONFLICT" } },
      { status: 404, body: { code: "API_CATALOG_BRAND_NOT_FOUND" } },
    ]);
  });
});
