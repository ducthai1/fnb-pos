import { dailySalesReportSchema } from "@fnb/contracts";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { signedInMember } from "../support/backoffice-accounts";
import { salesDay } from "../support/sales-day";
import { BUSINESS_DATE, line, orderIdOf, pay, pushOne, saveDraft } from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
let day: Awaited<ReturnType<typeof salesDay>>;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  s = await syncShop(app, pool);
  day = await salesDay(app, pool, s);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const reportOf = (
  branchId = s.shop.branchId,
  cookie = s.shop.managerCookie,
  date = BUSINESS_DATE,
) =>
  app.inject({
    method: "GET",
    url: `/reports/daily-sales?branchId=${branchId}&businessDate=${date}`,
    headers: { cookie },
  });

const report = async () => dailySalesReportSchema.parse((await reportOf()).json());

// Worked out by hand from the day in sales-day.ts. VAT inside the price is
// round(amount × rate / (100% + rate)) per rate and order; O3's 10.000 discount splits
// 4.737 / 5.263 over its 45.000 at 8% and 50.000 at 10%, and its 8% group (40.263 of tea
// + 4.250 of service charge) carries 3.297 of VAT, 315 of it on the service charge.
describe("the daily sales report", () => {
  it("adds the day's sales up to the đồng, by the report's fixed definitions", async () => {
    expect((await report()).sales).toEqual({
      orderCount: 4,
      gross: 262_000, // 58.000 + 39.000 + 95.000 + 70.000, the voided tea not in it
      discount: 10_000,
      net: 252_000,
      serviceCharge: 4_250, // 5% of O3's 85.000
      tax: 19_734, // 4.296 + 2.889 + (3.297 + 4.067) + 5.185
      taxByRate: [
        { rate: 800, base: 195_846, tax: 15_667 },
        { rate: 1000, base: 40_670, tax: 4_067 },
      ],
      netExcludingTax: 236_516,
      collected: 256_250, // 58.000 + 39.000 + 89.250 + 70.000
    });
  });

  it("keeps refunds apart, negative, on the day they were given back", async () => {
    expect((await report()).refunds).toEqual({
      orderCount: 1,
      collected: -29_000,
      tax: -2_148, // half of O1's 4.296
      taxByRate: [{ rate: 800, base: -26_852, tax: -2_148 }],
    });
  });

  it("splits the money by payment method, cash refunds against cash", async () => {
    expect((await report()).payments).toEqual([
      { method: "cash", sales: 217_250, refunds: -29_000, net: 188_250 },
      { method: "qr_transfer", sales: 39_000, refunds: 0, net: 39_000 },
    ]);
  });

  it("buckets sales by the branch's local hour at which the till took the money", async () => {
    expect((await report()).byHour).toEqual([
      { hour: 10, orderCount: 1, collected: 58_000 },
      { hour: 11, orderCount: 1, collected: 39_000 },
      { hour: 12, orderCount: 2, collected: 159_250 },
    ]);
  });

  it("lists the goods sold with toppings on rows of their own, voided units left out", async () => {
    const { menu } = s;
    expect((await report()).items).toEqual([
      expect.objectContaining({
        productId: menu.coffee.id,
        lineType: "item",
        quantity: "3",
        gross: 87_000,
        discount: 0,
        tax: 6_444,
      }),
      expect.objectContaining({
        modifierOptionId: menu.coffee.extraShot,
        lineType: "modifier",
        quantity: "1",
        gross: 10_000,
        tax: 741,
      }),
      expect.objectContaining({
        variantId: menu.peachTea.sizeL,
        quantity: "1",
        gross: 45_000,
        discount: 4_737,
        net: 40_263,
        tax: 2_982,
      }),
      expect.objectContaining({
        productId: day.beerId,
        quantity: "2",
        gross: 50_000,
        discount: 5_263,
        net: 44_737,
        tax: 4_067,
      }),
      expect.objectContaining({
        variantId: menu.peachTea.sizeM,
        quantity: "2",
        gross: 70_000,
        tax: 5_185,
      }),
    ]);
  });

  it("counts the voided units at their price, and the cancelled order", async () => {
    const { voids, cancelledOrders } = await report();
    expect(voids).toEqual({
      count: 1,
      value: 35_000,
      items: [
        expect.objectContaining({
          variantId: s.menu.peachTea.sizeM,
          count: 1,
          quantity: "1",
          value: 35_000,
        }),
      ],
    });
    expect(cancelledOrders).toBe(1);
  });

  it("agrees with itself: items, payments and rates add up to the sales totals", async () => {
    const r = await report();
    const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
    expect(sum(r.items.map((item) => item.gross))).toBe(r.sales.gross);
    expect(sum(r.payments.map((p) => p.sales))).toBe(r.sales.collected);
    expect(sum(r.sales.taxByRate.map((g) => g.base + g.tax))).toBe(r.sales.collected);
    expect(sum(r.byHour.map((h) => h.collected))).toBe(r.sales.collected);
  });

  it("is what the day close keeps, unchanged by a sale of that day synced after it", async () => {
    const before = await report();
    const closed = await app.inject({
      method: "POST",
      url: `/branches/${s.shop.branchId}/day-close`,
      headers: { cookie: s.shop.managerCookie },
      payload: { businessDate: BUSINESS_DATE },
    });
    expect(closed.json().dayClose.summary.report).toEqual(before);
    const late = saveDraft(s.tillA, [line(s.menu.coffee.id)]);
    await pushOne(app, s.tillA, late);
    await pushOne(app, s.tillA, pay(s.tillA, orderIdOf(late), 29_000));
    expect((await report()).sales.orderCount).toBe(before.sales.orderCount + 1);
    const kept = await app.inject({
      method: "GET",
      url: `/branches/${s.shop.branchId}/day-close?businessDate=${BUSINESS_DATE}`,
      headers: { cookie: s.shop.managerCookie },
    });
    expect(kept.json().dayClose.summary.report).toEqual(before);
  });

  it("is refused without view_reports, and answers 404 for another organization's branch", async () => {
    const cashier = await signedInMember(app, pool, s.shop.tenantId, {
      roleId: s.shop.roleIds.cashier,
    });
    expect((await reportOf(s.shop.branchId, cashier.cookie)).statusCode).toBe(403);
    const other = await syncShop(app, pool);
    expect((await reportOf(other.shop.branchId)).statusCode).toBe(404);
    expect((await reportOf(s.shop.branchId, s.shop.managerCookie, "2026-02-30")).statusCode).toBe(
      400,
    );
  });
});
