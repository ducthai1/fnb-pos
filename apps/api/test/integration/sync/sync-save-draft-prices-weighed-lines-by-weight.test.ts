import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { expectStatus } from "../support/catalog-shop";
import { changesOf, feedAfter } from "../support/menu-feed-probes";
import { line, orderIdOf, pay, pushOne, saveDraft, tillsClock } from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
/** Strawberries at 200.000 đ a kilogram. */
const strawberries = newId();
/** Coffee beans at 32.000 đ per 100 g. */
const beans = newId();

function putProduct(id: string, body: Record<string, unknown>) {
  return app.inject({
    method: "PUT",
    url: `/catalog/products/${id}`,
    headers: { cookie: s.shop.managerCookie },
    payload: { version: null, brandId: s.brandId, kind: "retail_item", taxRateBp: 0, ...body },
  });
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: tillsClock() });
  s = await syncShop(app, pool);
  const weighed = { pricingMode: "weighed" } as const;
  await expectStatus(
    putProduct(strawberries, {
      ...weighed,
      name: "Dâu tây Đà Lạt",
      basePrice: 200_000,
      measureUnit: "kg",
    }),
    201,
  );
  await expectStatus(
    putProduct(beans, { ...weighed, name: "Cà phê hạt", basePrice: 32_000, measureUnit: "100g" }),
    201,
  );
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

/** A draft selling `weight` (in the product's unit, as the till sends it) of `productId`. */
const weighing = (productId: string, weight: string) =>
  saveDraft(s.tillA, [line(productId, { quantity: weight })]);

describe("order.save_draft and products sold by weight", () => {
  it("prices 353 g of strawberries at 200.000 đ/kg to the đồng the server works out", async () => {
    const draft = weighing(strawberries, "0.353");
    const saved = await pushOne(app, s.tillA, draft);
    expect(saved.status).toBe("accepted");
    expect(saved.snapshot?.lines[0]).toMatchObject({ unitPrice: 200_000, quantity: "0.353" });
    const paid = await pushOne(app, s.tillA, pay(s.tillA, orderIdOf(draft), 70_600));
    expect(paid.status).toBe("accepted");
  });

  it("refuses a payment of an amount the till worked out its own way", async () => {
    const draft = weighing(strawberries, "0.353");
    expect((await pushOne(app, s.tillA, draft)).status).toBe("accepted");
    // 200.000 × 0,35 rounded down to the kilogram's tenth: not what the server charges.
    const wrong = await pushOne(app, s.tillA, pay(s.tillA, orderIdOf(draft), 70_000));
    expect(wrong).toMatchObject({ status: "rejected", code: "DOMAIN_ORDER_TOTAL_MISMATCH" });
  });

  it("prices beans per 100 g: 351 g at 32.000 đ is 112.320 đ", async () => {
    const draft = weighing(beans, "3.51");
    expect((await pushOne(app, s.tillA, draft)).status).toBe("accepted");
    const paid = await pushOne(app, s.tillA, pay(s.tillA, orderIdOf(draft), 112_320));
    expect(paid.status).toBe("accepted");
  });

  it.each([
    ["no weight at all", strawberries, "0", "DOMAIN_PRICING_WEIGHT_NOT_POSITIVE"],
    ["half a gram", beans, "3.505", "DOMAIN_PRICING_WEIGHT_NOT_WHOLE_GRAMS"],
    ["more than 100 kg on one line", strawberries, "100.001", "DOMAIN_PRICING_WEIGHT_TOO_LARGE"],
  ])("refuses a weighed line of %s", async (_case, productId, weight, code) => {
    const refused = await pushOne(app, s.tillA, weighing(productId, weight));
    expect(refused).toMatchObject({ status: "rejected", code });
  });

  it("sells a product of fixed price in whatever units it is sent, as before", async () => {
    const draft = saveDraft(s.tillA, [line(s.menu.coffee.id, { quantity: "2" })]);
    expect((await pushOne(app, s.tillA, draft)).status).toBe("accepted");
  });
});

describe("what a weighed product's price is per, in the catalog", () => {
  it("keeps the unit, answers it to the backoffice and sends it to the tills", async () => {
    const before = await feedAfter(app, s.tillA.deviceToken);
    const read = await app.inject({
      method: "GET",
      url: `/catalog/products/${beans}`,
      headers: { cookie: s.shop.managerCookie },
    });
    expect(read.json()).toMatchObject({ pricingMode: "weighed", measureUnit: "100g" });
    const { version } = read.json() as { version: number };
    const perKg = { pricingMode: "weighed", name: "Cà phê hạt", basePrice: 320_000 };
    await expectStatus(putProduct(beans, { ...perKg, version, measureUnit: "kg" }), 200);
    const sent = changesOf(
      (await feedAfter(app, s.tillA.deviceToken, before.cursor)).changes,
      "catalog_product",
      beans,
    );
    expect(sent.at(-1)?.snapshot).toMatchObject({ measureUnit: "kg", basePrice: 320_000 });
  });

  it("refuses a weighed product without a unit and a unit on any other product", async () => {
    const noUnit = await putProduct(newId(), { pricingMode: "weighed", name: "Nho", basePrice: 1 });
    expect(noUnit.statusCode).toBe(400);
    expect(noUnit.json()).toMatchObject({ code: "DOMAIN_PRICING_MEASURE_UNIT_MISSING" });
    const fixed = await putProduct(newId(), {
      pricingMode: "fixed",
      name: "Bánh mì",
      basePrice: 20_000,
      measureUnit: "kg",
    });
    expect(fixed.json()).toMatchObject({
      code: "DOMAIN_PRICING_MEASURE_UNIT_ON_UNWEIGHED_PRODUCT",
    });
  });

  it("will not store a unit on an unweighed product even when the domain is gone round", async () => {
    // The database holds the same rule, so a script writing rows directly cannot break it.
    const refused = await withTenant(pool, s.shop.tenantId, (client) =>
      client.query("UPDATE product SET measure_unit = 'kg' WHERE pricing_mode = 'fixed'"),
    ).then(
        () => null,
        (error: { code?: string }) => error.code,
      );
    expect(refused).toBe("23514");
  });
});
