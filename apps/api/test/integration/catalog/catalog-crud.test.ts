import { withTenant } from "@fnb/db";
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

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  shop = await catalogShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("PUT and GET /catalog/products/:id", () => {
  it("creates the pearl milk tea and reads back every field it was given", async () => {
    const { ids, body, url } = pearlMilkTeaDocument(shop);
    const created = await expectStatus(shop.call("PUT", url, body), 201);
    const read = await expectStatus(shop.call("GET", url), 200);
    expect(read.json()).toEqual(storedDocument(ids.product, body, 1));
    expect(created.json()).toEqual(read.json());
  });

  it("replaces the product as a whole and bumps its version", async () => {
    const { ids, body, url } = pearlMilkTeaDocument(shop);
    await expectStatus(shop.call("PUT", url, body), 201);
    const [sugar, ice, topping] = body.modifierGroups;
    if (!sugar || !ice || !topping) throw new Error("fixture lost a group");
    // Large gets cheaper, toppings lose jelly and pudding gets a higher cap; ice is dropped.
    const changed = {
      ...body,
      version: 1,
      variants: [body.variants[0], { id: ids.sizeL, name: "L", price: 42_000 }],
      modifierGroups: [
        sugar,
        {
          ...topping,
          options: [topping.options[0], { ...topping.options[2], maxQuantity: 3 }],
          variantRules: { [ids.sizeL]: { minSelect: 1, maxSelect: 5 } },
        },
      ],
    };
    const replaced = await expectStatus(shop.call("PUT", url, changed), 200);
    expect(replaced.json()).toEqual(storedDocument(ids.product, changed, 2));
  });

  it("archives variants and options left out instead of deleting them", async () => {
    const { ids, body, url } = pearlMilkTeaDocument(shop);
    await expectStatus(shop.call("PUT", url, body), 201);
    const [sugar, ice, topping] = body.modifierGroups;
    if (!sugar || !ice || !topping) throw new Error("fixture lost a group");
    const withoutLAndJelly = {
      ...body,
      version: 1,
      variants: [body.variants[0]],
      modifierGroups: [sugar, ice, { ...topping, options: [topping.options[0]], variantRules: {} }],
    };
    await expectStatus(shop.call("PUT", url, withoutLAndJelly), 200);
    const archived = await withTenant(pool, shop.tenant.tenantId, async (client) => {
      const rows = await client.query(
        "SELECT id, archived_at IS NOT NULL AS archived FROM product_variant WHERE id = $1 " +
          "UNION ALL SELECT id, archived_at IS NOT NULL FROM modifier_option WHERE id = ANY($2::uuid[]) " +
          "ORDER BY id",
        [ids.sizeL, [ids.pearl, ids.jelly]],
      );
      return Object.fromEntries(rows.rows.map((row) => [row.id, row.archived]));
    });
    expect(archived).toEqual({ [ids.sizeL]: true, [ids.jelly]: true, [ids.pearl]: false });

    // Sending them again brings the very same rows back.
    await expectStatus(shop.call("PUT", url, { ...body, version: 2 }), 200);
    const read = await expectStatus(shop.call("GET", url), 200);
    expect(read.json()).toEqual(storedDocument(ids.product, body, 3));
  });

  it("refuses a save based on a stale version with 409 and keeps the stored one", async () => {
    const { ids, body, url } = pearlMilkTeaDocument(shop);
    await expectStatus(shop.call("PUT", url, body), 201);
    await expectStatus(shop.call("PUT", url, { ...body, version: 1, name: "Trà sữa mới" }), 200);
    const stale = await shop.call("PUT", url, { ...body, version: 1, name: "Trà sữa cũ" });
    const fresh = await shop.call("PUT", url, { ...body, version: null });
    expect([stale.statusCode, stale.json(), fresh.statusCode, fresh.json()]).toEqual([
      409,
      { code: "API_CATALOG_VERSION_CONFLICT" },
      409,
      { code: "API_CATALOG_VERSION_CONFLICT" },
    ]);
    const read = await expectStatus(shop.call("GET", url), 200);
    expect(read.json()).toEqual(storedDocument(ids.product, { ...body, name: "Trà sữa mới" }, 2));
  });

  it("lets exactly one of two concurrent saves of the same version through", async () => {
    const { body, url } = pearlMilkTeaDocument(shop);
    await expectStatus(shop.call("PUT", url, body), 201);
    const saves = await Promise.all(
      ["Trà sữa A", "Trà sữa B"].map((name) =>
        shop.call("PUT", url, { ...body, version: 1, name }),
      ),
    );
    expect(saves.map((save) => save.statusCode).sort()).toEqual([200, 409]);
    const read = await expectStatus(shop.call("GET", url), 200);
    expect(read.json()).toMatchObject({ version: 2 });
  });

  it("answers 404 when replacing a product that was never created", async () => {
    const { body, url } = pearlMilkTeaDocument(shop);
    const response = await shop.call("PUT", url, { ...body, version: 1 });
    expect([response.statusCode, response.json()]).toEqual([
      404,
      { code: "API_CATALOG_PRODUCT_NOT_FOUND" },
    ]);
  });
});

describe("listing and archiving products", () => {
  it("lists the brand's products and archives one without losing it", async () => {
    const { ids, body, url } = pearlMilkTeaDocument(shop);
    await expectStatus(shop.call("PUT", url, { ...body, name: "Trà sữa lưu trữ" }), 201);
    const archived = await expectStatus(shop.call("POST", `${url}/archive`), 200);
    const again = await expectStatus(shop.call("POST", `${url}/archive`), 200);
    expect(archived.json()).toEqual({
      id: ids.product,
      version: 2,
      archivedAt: expect.any(String),
    });
    expect(again.json()).toEqual(archived.json());

    const listed = await expectStatus(
      shop.call("GET", `/catalog/products?brandId=${shop.brandId}`),
      200,
    );
    expect(listed.json()).toContainEqual({
      id: ids.product,
      name: "Trà sữa lưu trữ",
      kind: "prepared_drink",
      categoryId: shop.categoryId,
      basePrice: 35_000,
      pricingMode: "fixed",
      measureUnit: null,
      version: 2,
      archivedAt: archived.json().archivedAt,
      imageUrl: null,
    });
    const read = await expectStatus(shop.call("GET", url), 200);
    expect(read.json()).toMatchObject({ archivedAt: archived.json().archivedAt, version: 2 });
  });

  it("answers 404 when archiving a product that does not exist", async () => {
    const { url } = pearlMilkTeaDocument(shop);
    const response = await shop.call("POST", `${url}/archive`);
    expect([response.statusCode, response.json()]).toEqual([
      404,
      { code: "API_CATALOG_PRODUCT_NOT_FOUND" },
    ]);
  });

  it("requires a signed-in member", async () => {
    const { url } = pearlMilkTeaDocument(shop);
    const response = await app.inject({ method: "GET", url });
    expect(response.statusCode).toBe(401);
  });
});
