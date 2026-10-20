import { describe, expect, it } from "vitest";
import { outcomeOf } from "../zod-issue-test-helpers";
import { dailySalesQuerySchema, dailySalesReportSchema } from "./daily-sales-report-schema";

const BRANCH = "0192f5a4-7c3e-7d10-8b2a-000000000001";

const EMPTY_DAY = {
  branchId: BRANCH,
  businessDate: "2026-10-20",
  sales: {
    orderCount: 0,
    gross: 0,
    discount: 0,
    net: 0,
    serviceCharge: 0,
    tax: 0,
    taxByRate: [],
    netExcludingTax: 0,
    collected: 0,
  },
  refunds: { orderCount: 0, collected: 0, tax: 0, taxByRate: [] },
  payments: [],
  byHour: [],
  items: [],
  voids: { count: 0, value: 0, items: [] },
  cancelledOrders: 0,
  qrRefunds: { count: 0, amount: 0, byMethod: [] },
};

describe("dailySalesReportSchema", () => {
  it("takes a day with nothing sold", () => {
    expect(dailySalesReportSchema.parse(EMPTY_DAY)).toEqual(EMPTY_DAY);
  });

  it.each([
    ["an amount in fractions of a đồng", { sales: { ...EMPTY_DAY.sales, gross: 0.5 } }],
    ["an hour past 23", { byHour: [{ hour: 24, orderCount: 1, collected: 1 }] }],
    ["a figure nobody defined", { tips: 0 }],
    ["QR money handed back without saying how", { qrRefunds: { count: 1, amount: 5_000 } }],
  ])("refuses %s", (_case, change) => {
    expect(outcomeOf(dailySalesReportSchema, { ...EMPTY_DAY, ...change }).ok).toBe(false);
  });
});

describe("dailySalesQuerySchema", () => {
  it("names one branch and one day, both required", () => {
    expect(
      outcomeOf(dailySalesQuerySchema, { branchId: BRANCH, businessDate: "2026-10-20" }).ok,
    ).toBe(true);
    expect(outcomeOf(dailySalesQuerySchema, { branchId: BRANCH }).ok).toBe(false);
    expect(outcomeOf(dailySalesQuerySchema, { businessDate: "2026-10-20" }).ok).toBe(false);
  });
});
