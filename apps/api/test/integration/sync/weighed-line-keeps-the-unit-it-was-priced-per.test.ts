import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { expectStatus } from "../support/catalog-shop";
import { kitchenStation, sentToKitchen, ticketLine } from "../support/kitchen-commands";
import { approve, hireManager, signInAs, voidOfSent } from "../support/sync-approvals";
import {
  BUSINESS_DATE,
  line,
  orderIdOf,
  pay,
  pushOne,
  saveDraft,
  tillsClock,
} from "../support/sync-commands";
import { refund, voidUnits, withApproval } from "../support/sync-order-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
let bar: string;
let managerId: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: tillsClock() });
  s = await syncShop(app, pool);
  bar = await kitchenStation(app, s);
  managerId = await hireManager(app, s);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

/** A weighed product of its own, priced per `unit`, so each case changes only its own. */
async function weighedProduct(unit: "kg" | "100g", basePrice: number) {
  const id = newId();
  await saveProduct(id, null, unit, basePrice);
  return id;
}

async function saveProduct(id: string, version: number | null, unit: string, basePrice: number) {
  await expectStatus(
    app.inject({
      method: "PUT",
      url: `/catalog/products/${id}`,
      headers: { cookie: s.shop.managerCookie },
      payload: {
        version,
        brandId: s.brandId,
        kind: "retail_item",
        taxRateBp: 0,
        pricingMode: "weighed",
        name: "Cà phê hạt Cầu Đất",
        basePrice,
        measureUnit: unit,
      },
    }),
    version === null ? 201 : 200,
  );
}

/** The backoffice switching the product's unit, at the same price per gram. */
async function switchUnit(id: string, unit: "kg" | "100g", basePrice: number) {
  const version = await withTenant(pool, s.shop.tenantId, async (client) => {
    const { rows } = await client.query("SELECT version FROM product WHERE id = $1", [id]);
    return rows[0].version as number;
  });
  await saveProduct(id, version, unit, basePrice);
}

const weighing = (productId: string, quantity: string, measureUnit?: "kg" | "100g") =>
  line(productId, { quantity, ...(measureUnit === undefined ? {} : { measureUnit }) });

const storedLines = (orderId: string) =>
  withTenant(pool, s.shop.tenantId, async (client) => {
    const { rows } = await client.query(
      "SELECT quantity::text AS quantity, unit_price::text AS price, measure_unit AS unit, " +
        "reverses_line_id IS NOT NULL AS reverses FROM sales_order_line " +
        "WHERE order_id = $1 AND line_type = 'item' ORDER BY position, created_at",
      [orderId],
    );
    return rows;
  });

describe("a weighed line keeps the unit it was priced per", () => {
  it("is stored and sent back with its unit, and an old till's quantity is read in the server's", async () => {
    const beans = await weighedProduct("kg", 320_000);
    const named = saveDraft(s.tillA, [weighing(beans, "0.351", "kg")]);
    const saved = await pushOne(app, s.tillA, named);
    expect(saved.snapshot?.lines[0]).toMatchObject({ quantity: "0.351", measureUnit: "kg" });
    const old = saveDraft(s.tillA, [weighing(beans, "0.351")]);
    expect((await pushOne(app, s.tillA, old)).snapshot?.lines[0]).toMatchObject({
      quantity: "0.351",
      measureUnit: "kg",
    });
    expect(await storedLines(orderIdOf(old))).toEqual([
      { quantity: "0.351", price: "320000", unit: "kg", reverses: false },
    ]);
  });

  it("reads 350 g from an offline till with a stale per-kg menu as 3.5 per 100 g, and takes its payment", async () => {
    const beans = await weighedProduct("kg", 200_000);
    await switchUnit(beans, "100g", 20_000);
    // The till never heard of the switch: it weighed 350 g and counted it in kilograms.
    const draft = saveDraft(s.tillA, [weighing(beans, "0.35", "kg")]);
    const saved = await pushOne(app, s.tillA, draft);
    expect(saved.snapshot?.lines[0]).toMatchObject({
      quantity: "3.5",
      unitPrice: 20_000,
      measureUnit: "100g",
    });
    expect((await pushOne(app, s.tillA, pay(s.tillA, orderIdOf(draft), 70_000))).status).toBe(
      "accepted",
    );
    // An old till, which sends no unit, is read in the server's unit as it always was.
    const old = saveDraft(s.tillA, [weighing(beans, "3.5")]);
    expect((await pushOne(app, s.tillA, old)).snapshot?.lines[0]).toMatchObject({
      quantity: "3.5",
      measureUnit: "100g",
    });
  });

  it("keeps a line the bar has in its unit while two tills save the table across a unit change", async () => {
    const beans = await weighedProduct("kg", 200_000);
    const weighed = weighing(beans, "0.35", "kg");
    const opened = saveDraft(s.tillA, [weighed]);
    const orderId = orderIdOf(opened);
    expect((await pushOne(app, s.tillA, opened)).status).toBe("accepted");
    const ticket = sentToKitchen(s.tillA, orderId, bar, [ticketLine(weighed.lineId, "0.35", "new")]);
    expect((await pushOne(app, s.tillA, ticket)).status).toBe("accepted");
    await switchUnit(beans, "100g", 20_000);

    // Till B has the new menu: the same 350 g, now 3.5 per 100 g, plus a new weighing.
    const added = weighing(beans, "1.2", "100g");
    const fromB = saveDraft(
      s.tillB,
      [{ ...weighed, quantity: "3.5", measureUnit: "100g" }, added],
      { orderId, deviceOrderNo: 900 },
    );
    expect((await pushOne(app, s.tillB, fromB)).status).toBe("accepted");
    // Till A still has the old menu and saves the table again in kilograms.
    const fromA = saveDraft(s.tillA, [weighed, { ...added, quantity: "0.12", measureUnit: "kg" }], {
      orderId,
    });
    expect((await pushOne(app, s.tillA, fromA)).status).toBe("accepted");
    expect(await storedLines(orderId)).toEqual([
      { quantity: "0.350", price: "200000", unit: "kg", reverses: false },
      { quantity: "1.200", price: "20000", unit: "100g", reverses: false },
    ]);
  });

  it("voids 3.51 of a line per 100 g after a switch to kg, in the line's own unit", async () => {
    const beans = await weighedProduct("100g", 32_000);
    const weighed = weighing(beans, "3.51", "100g");
    const draft = saveDraft(s.tillA, [weighed]);
    const orderId = orderIdOf(draft);
    expect((await pushOne(app, s.tillA, draft)).status).toBe("accepted");
    const ticket = sentToKitchen(s.tillA, orderId, bar, [ticketLine(weighed.lineId, "3.51", "new")]);
    expect((await pushOne(app, s.tillA, ticket)).status).toBe("accepted");
    await switchUnit(beans, "kg", 320_000);
    const approvalId = await approve(app, s.tillA, managerId, voidOfSent(orderId, weighed.lineId, "3.51"));
    const voided = await pushOne(
      app,
      s.tillA,
      withApproval(voidUnits(s.tillA, orderId, weighed.lineId, "3.51"), approvalId),
    );
    expect(voided.status).toBe("accepted");
    expect(await storedLines(orderId)).toEqual([
      { quantity: "3.510", price: "32000", unit: "100g", reverses: false },
      { quantity: "-3.510", price: "32000", unit: "100g", reverses: true },
    ]);
  });

  it("refunds a weighing in the unit it was sold per, after the unit changed", async () => {
    const beans = await weighedProduct("kg", 200_000);
    const weighed = weighing(beans, "0.25", "kg");
    const draft = saveDraft(s.tillA, [weighed]);
    const saleId = orderIdOf(draft);
    expect((await pushOne(app, s.tillA, draft)).status).toBe("accepted");
    expect((await pushOne(app, s.tillA, pay(s.tillA, saleId, 50_000))).status).toBe("accepted");
    await switchUnit(beans, "100g", 20_000);
    // Refunded from the manager's till, who needs nobody's approval.
    await signInAs(app, s, s.tillB, "manager");
    const lines = [{ lineId: weighed.lineId, quantity: "0.25", restock: false }];
    const back = refund(s.tillB, saleId, lines, -50_000);
    const refunded = await pushOne(app, s.tillB, back);
    expect(refunded).toMatchObject({ status: "accepted" });
    const refundId = (back.payload as { refundOrderId: string }).refundOrderId;
    expect(await storedLines(refundId)).toEqual([
      { quantity: "-0.250", price: "200000", unit: "kg", reverses: true },
    ]);
  });

  it("reports a product sold per kg and then per 100 g as two rows, never adding 0.35 to 3.5", async () => {
    const beans = await weighedProduct("kg", 200_000);
    const first = saveDraft(s.tillA, [weighing(beans, "0.35", "kg")]);
    await pushOne(app, s.tillA, first);
    expect((await pushOne(app, s.tillA, pay(s.tillA, orderIdOf(first), 70_000))).status).toBe("accepted");
    await switchUnit(beans, "100g", 20_000);
    const second = saveDraft(s.tillA, [weighing(beans, "1.5", "100g")]);
    await pushOne(app, s.tillA, second);
    expect((await pushOne(app, s.tillA, pay(s.tillA, orderIdOf(second), 30_000))).status).toBe("accepted");
    const response = await app.inject({
      method: "GET",
      url: `/reports/daily-sales?branchId=${s.shop.branchId}&businessDate=${BUSINESS_DATE}`,
      headers: { cookie: s.shop.managerCookie },
    });
    expect(response.statusCode).toBe(200);
    const rows = (response.json().items as { productId: string }[]).filter(
      (item) => item.productId === beans,
    );
    expect(rows).toEqual([
      expect.objectContaining({ quantity: "0.35", measureUnit: "kg", gross: 70_000 }),
      expect.objectContaining({ quantity: "1.5", measureUnit: "100g", gross: 30_000 }),
    ]);
  });
});
