import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { type CatalogShop, catalogShop, expectStatus } from "../support/catalog-shop";
import { pearlMilkTeaDocument, storedDocument } from "../support/pearl-milk-tea-document";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let shop: CatalogShop;
let tea: ReturnType<typeof pearlMilkTeaDocument>;
let peachTea: ReturnType<typeof pearlMilkTeaDocument>;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  shop = await catalogShop(app, pool);
  tea = pearlMilkTeaDocument(shop);
  peachTea = pearlMilkTeaDocument(shop);
  await expectStatus(shop.call("PUT", tea.url, tea.body), 201);
  await expectStatus(shop.call("PUT", peachTea.url, { ...peachTea.body, name: "Trà đào" }), 201);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

function breakfastCombo(
  drinkOptions: { productId: string; variantId: string | null; upcharge: number }[],
) {
  const id = newId();
  const body = {
    version: null,
    brandId: shop.brandId,
    categoryId: null,
    kind: "combo",
    name: "Combo sáng",
    basePrice: 59_000,
    pricingMode: "fixed",
    taxRateBp: 800,
    stationId: null,
    trackStock: false,
    earnsPoints: true,
    printCupLabel: false,
    variants: [],
    modifierGroups: [],
    combo: {
      slots: [
        { id: newId(), name: "Đồ uống", minSelect: 1, maxSelect: 1, options: drinkOptions },
        { id: newId(), name: "Tráng miệng", minSelect: 0, maxSelect: 2, options: [] },
      ],
    },
  };
  return { id, body, url: `/catalog/products/${id}` };
}

describe("a combo product", () => {
  it("stores its slots and the sizes each slot offers, in order", async () => {
    const combo = breakfastCombo([
      { productId: tea.ids.product, variantId: tea.ids.sizeM, upcharge: 0 },
      { productId: tea.ids.product, variantId: tea.ids.sizeL, upcharge: 10_000 },
      { productId: peachTea.ids.product, variantId: peachTea.ids.sizeM, upcharge: 3_000 },
    ]);
    await expectStatus(shop.call("PUT", combo.url, combo.body), 201);
    const read = await expectStatus(shop.call("GET", combo.url), 200);
    expect(read.json()).toEqual(storedDocument(combo.id, combo.body, 1));
  });

  it("rewrites its slots on replace", async () => {
    const combo = breakfastCombo([
      { productId: tea.ids.product, variantId: tea.ids.sizeM, upcharge: 0 },
    ]);
    await expectStatus(shop.call("PUT", combo.url, combo.body), 201);
    const slots = [
      {
        id: newId(),
        name: "Trà",
        minSelect: 1,
        maxSelect: 2,
        options: combo.body.combo.slots[0]?.options ?? [],
      },
    ];
    const replaced = { ...combo.body, version: 1, combo: { slots } };
    await expectStatus(shop.call("PUT", combo.url, replaced), 200);
    const read = await expectStatus(shop.call("GET", combo.url), 200);
    expect(read.json()).toEqual(storedDocument(combo.id, replaced, 2));
  });

  it("refuses a size that belongs to another product than the one it names", async () => {
    const combo = breakfastCombo([
      { productId: peachTea.ids.product, variantId: tea.ids.sizeL, upcharge: 0 },
    ]);
    const response = await shop.call("PUT", combo.url, combo.body);
    expect([response.statusCode, response.json()]).toEqual([
      404,
      { code: "API_CATALOG_REFERENCE_NOT_FOUND" },
    ]);
  });

  it("refuses the same size twice in one slot with the domain's code", async () => {
    const option = { productId: tea.ids.product, variantId: tea.ids.sizeM };
    const combo = breakfastCombo([
      { ...option, upcharge: 0 },
      { ...option, upcharge: 5_000 },
    ]);
    const response = await shop.call("PUT", combo.url, combo.body);
    expect([response.statusCode, response.json()]).toEqual([
      400,
      {
        code: "DOMAIN_CATALOG_DUPLICATE_COMBO_SLOT_OPTION",
        details: { slotId: combo.body.combo.slots[0]?.id, ...option },
      },
    ]);
  });

  it("refuses combo slots on a product that is not a combo", async () => {
    const plain = { ...tea.body, combo: breakfastCombo([]).body.combo };
    const id = newId();
    const response = await shop.call("PUT", `/catalog/products/${id}`, plain);
    expect([response.statusCode, response.json()]).toEqual([
      400,
      { code: "DOMAIN_CATALOG_COMBO_DEFINITION_ON_NON_COMBO", details: { productId: id } },
    ]);
  });

  it("refuses a slot that offers another combo, and keeps the stored combo as it was", async () => {
    const inner = breakfastCombo([
      { productId: tea.ids.product, variantId: tea.ids.sizeM, upcharge: 0 },
    ]);
    await expectStatus(shop.call("PUT", inner.url, inner.body), 201);
    const outer = breakfastCombo([{ productId: inner.id, variantId: null, upcharge: 0 }]);
    const response = await shop.call("PUT", outer.url, outer.body);
    expect([response.statusCode, response.json()]).toEqual([
      400,
      { code: "API_CATALOG_COMBO_OPTION_IS_COMBO" },
    ]);
    expect((await shop.call("GET", outer.url)).statusCode).toBe(404);
  });

  it("refuses a slot that offers a product taken off the menu, and takes it again once it is back", async () => {
    const gone = newId();
    const body = { ...tea.body, name: "Món đã ngừng", combo: null, variants: [], modifierGroups: [] };
    await expectStatus(shop.call("PUT", `/catalog/products/${gone}`, body), 201);
    await expectStatus(shop.call("POST", `/catalog/products/${gone}/archive`), 200);
    const combo = breakfastCombo([{ productId: gone, variantId: null, upcharge: 0 }]);
    const refused = await shop.call("PUT", combo.url, combo.body);
    expect([refused.statusCode, refused.json()]).toEqual([
      400,
      { code: "API_CATALOG_COMBO_OPTION_ARCHIVED" },
    ]);
    const stored = (await expectStatus(shop.call("GET", `/catalog/products/${gone}`), 200)).json() as {
      version: number;
    };
    await expectStatus(
      shop.call("POST", `/catalog/products/${gone}/unarchive`, { version: stored.version }),
      200,
    );
    expect((await shop.call("PUT", combo.url, combo.body)).statusCode).toBe(201);
  });
});
