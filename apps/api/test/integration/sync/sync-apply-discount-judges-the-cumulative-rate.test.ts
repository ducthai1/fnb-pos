import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { expectStatus } from "../support/catalog-shop";
import { approve, hireManager } from "../support/sync-approvals";
import {
  type LineIntent,
  line,
  orderIdOf,
  pay,
  pushOne,
  saveDraft,
  tillsClock,
} from "../support/sync-commands";
import { discount, percentOffLine, withApproval } from "../support/sync-order-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
let managerId: string;
/** A 50.000đ cake taxed at 10%, beside the coffee's 8%. */
const cake = newId();

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: tillsClock() });
  s = await syncShop(app, pool);
  managerId = await hireManager(app, s);
  await expectStatus(
    app.inject({
      method: "PUT",
      url: `/catalog/products/${cake}`,
      headers: { cookie: s.shop.managerCookie },
      payload: {
        version: null,
        brandId: s.brandId,
        kind: "retail_item",
        name: "Bánh bông lan",
        pricingMode: "fixed",
        basePrice: 50_000,
        taxRateBp: 1_000,
      },
    }),
    201,
  );
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

/** A draft of one 29.000đ coffee (and whatever else), as the cashier on till A saves it. */
async function draftWith(...more: LineIntent[]) {
  const coffee = line(s.menu.coffee.id);
  const sent = saveDraft(s.tillA, [coffee, ...more]);
  expect((await pushOne(app, s.tillA, sent)).status).toBe("accepted");
  return { orderId: orderIdOf(sent), coffee };
}

describe("order.apply_discount on one item", () => {
  it("takes 10% off the coffee as a discount under it, within the cashier's cap", async () => {
    const { orderId, coffee } = await draftWith();
    const result = await pushOne(
      app,
      s.tillA,
      percentOffLine(s.tillA, orderId, coffee.lineId, 1_000),
    );
    expect(result.status).toBe("accepted");
    expect(result.snapshot?.lines[1]).toMatchObject({
      lineType: "discount",
      parentLineId: coffee.lineId,
      unitPrice: -2_900,
      wholeParentLine: true,
    });
    expect((await pushOne(app, s.tillA, pay(s.tillA, orderId, 26_100))).status).toBe("accepted");
  });

  it("judges three 10% discounts by what they take off together, so the second needs approval", async () => {
    const { orderId, coffee } = await draftWith();
    const tenPercent = () => percentOffLine(s.tillA, orderId, coffee.lineId, 1_000);
    expect((await pushOne(app, s.tillA, tenPercent())).status).toBe("accepted");
    expect((await pushOne(app, s.tillA, tenPercent())).code).toBe("SYNC_APPROVAL_REQUIRED");
    // 2.900 + 2.610 of 29.000 is 19% of the coffee, and that is what the manager approves.
    const approvalId = await approve(app, s.tillA, managerId, {
      key: "line_discount",
      discountRate: 1_900,
    });
    expect((await pushOne(app, s.tillA, withApproval(tenPercent(), approvalId))).status).toBe(
      "accepted",
    );
    // The third reaches 27,1%, which the approval of 19% does not cover.
    expect((await pushOne(app, s.tillA, withApproval(tenPercent(), approvalId))).code).toBe(
      "SYNC_APPROVAL_FOR_ANOTHER_ACTION",
    );
    const next = await draftWith();
    const again = () => percentOffLine(s.tillA, next.orderId, next.coffee.lineId, 1_000);
    expect((await pushOne(app, s.tillA, again())).status).toBe("accepted");
    expect((await pushOne(app, s.tillA, withApproval(again(), approvalId))).code).toBe(
      "SYNC_APPROVAL_ALREADY_USED",
    );
  });

  it.each([
    ["another rate of the same action", { key: "line_discount", discountRate: 2_000 }],
    ["another action", { key: "order_discount", discountRate: 1_500 }],
  ])("refuses an approval of %s", async (_case, action) => {
    const { orderId, coffee } = await draftWith();
    const approvalId = await approve(app, s.tillA, managerId, action);
    const result = await pushOne(
      app,
      s.tillA,
      withApproval(percentOffLine(s.tillA, orderId, coffee.lineId, 1_500), approvalId),
    );
    expect(result).toMatchObject({ status: "rejected", code: "SYNC_APPROVAL_FOR_ANOTHER_ACTION" });
  });

  it("refuses a fixed amount above what the coffee still costs, rather than cutting it down", async () => {
    const { orderId, coffee } = await draftWith();
    const tooMuch = discount(s.tillA, orderId, {
      scope: "line",
      lineId: coffee.lineId,
      discount: { kind: "fixed_for_line", amount: 29_001 },
    });
    expect((await pushOne(app, s.tillA, tooMuch)).code).toBe("DOMAIN_TOTALS_DISCOUNT_EXCEEDS_BASE");
  });

  it("locks the discounted coffee against draft saves that would change it", async () => {
    const { orderId, coffee } = await draftWith();
    await pushOne(app, s.tillA, percentOffLine(s.tillA, orderId, coffee.lineId, 1_000));
    const fewer = saveDraft(s.tillA, [{ ...coffee, quantity: "2" }], { orderId });
    expect((await pushOne(app, s.tillA, fewer)).code).toBe("SYNC_LINE_LOCKED");
  });
});

describe("order.apply_discount on the whole order", () => {
  const tenPercentOff = {
    scope: "order" as const,
    discount: { kind: "percent" as const, rate: 1_000 },
  };

  it("needs approval from a cashier, who has no order discount of their own", async () => {
    const { orderId } = await draftWith();
    expect((await pushOne(app, s.tillA, discount(s.tillA, orderId, tenPercentOff))).code).toBe(
      "SYNC_APPROVAL_REQUIRED",
    );
    const approvalId = await approve(app, s.tillA, managerId, {
      key: "order_discount",
      discountRate: 1_000,
    });
    const result = await pushOne(
      app,
      s.tillA,
      withApproval(discount(s.tillA, orderId, tenPercentOff), approvalId),
    );
    expect(result.status).toBe("accepted");
    expect((await pushOne(app, s.tillA, pay(s.tillA, orderId, 26_100))).status).toBe("accepted");
  });

  it("splits it into one line per tax rate, and refuses too few ids for them", async () => {
    const { orderId } = await draftWith(line(cake));
    const approve10 = () =>
      approve(app, s.tillA, managerId, { key: "order_discount", discountRate: 1_000 });
    const short = withApproval(discount(s.tillA, orderId, tenPercentOff, 1), await approve10());
    expect((await pushOne(app, s.tillA, short)).code).toBe("SYNC_DISCOUNT_LINE_IDS_TOO_FEW");
    const enough = withApproval(discount(s.tillA, orderId, tenPercentOff, 3), await approve10());
    const result = await pushOne(app, s.tillA, enough);
    const discounts = result.snapshot?.lines.filter((entry) => entry.lineType === "discount");
    expect(discounts?.map((entry) => [entry.taxRate, entry.unitPrice])).toEqual([
      [800, -2_900],
      [1_000, -5_000],
    ]);
  });

  it("refuses a draft save that would make the discount a larger share of fewer goods", async () => {
    const tea = line(s.menu.peachTea.id, { variantId: s.menu.peachTea.sizeM });
    const { orderId, coffee } = await draftWith(tea);
    const approvalId = await approve(app, s.tillA, managerId, {
      key: "order_discount",
      discountRate: 1_000,
    });
    await pushOne(
      app,
      s.tillA,
      withApproval(discount(s.tillA, orderId, tenPercentOff), approvalId),
    );
    const without = await pushOne(app, s.tillA, saveDraft(s.tillA, [coffee], { orderId }));
    expect(without.code).toBe("SYNC_DISCOUNT_RATE_RAISED");
    const more = saveDraft(s.tillA, [coffee, tea, line(s.menu.coffee.id)], { orderId });
    expect((await pushOne(app, s.tillA, more)).status).toBe("accepted");
  });

  it("refuses discount line ids another order already uses", async () => {
    const { orderId, coffee } = await draftWith();
    const first = percentOffLine(s.tillA, orderId, coffee.lineId, 500);
    await pushOne(app, s.tillA, first);
    const other = await draftWith();
    const reused = { ...percentOffLine(s.tillA, other.orderId, other.coffee.lineId, 500) };
    reused.payload = {
      ...(reused.payload as object),
      discountLineIds: (first.payload as { discountLineIds: string[] }).discountLineIds,
    };
    expect((await pushOne(app, s.tillA, reused)).code).toBe("SYNC_LINE_ID_TAKEN");
  });
});
