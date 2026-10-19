import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { expectStatus } from "../support/catalog-shop";
import { approve, hireManager, justNow, signInAs } from "../support/sync-approvals";
import { type LineIntent, line, orderIdOf, pushOne, saveDraft } from "../support/sync-commands";
import { type SyncShop, type Till, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
let managerId: string;
const cake = newId();

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  s = await syncShop(app, pool);
  managerId = await hireManager(app, s);
  // Till B is run by a waiter, who may not type a price alone.
  await signInAs(app, s, s.tillB, "waiter");
  await expectStatus(
    app.inject({
      method: "PUT",
      url: `/catalog/products/${cake}`,
      headers: { cookie: s.shop.managerCookie },
      payload: {
        version: null,
        brandId: s.brandId,
        kind: "retail_item",
        name: "Bánh nhà làm",
        pricingMode: "open_price",
        basePrice: null,
        taxRateBp: 800,
      },
    }),
    201,
  );
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const typed = (price: number) => line(cake, { enteredPrice: price });

function draft(
  till: Till,
  lines: LineIntent[],
  order: { orderId?: string; approvalId?: string } = {},
) {
  const sent = saveDraft(till, lines, order);
  const payload = { ...(sent.payload as object), approvalId: order.approvalId };
  return { ...sent, createdAt: justNow(), payload };
}

describe("order.save_draft and open prices", () => {
  it("sells an open-price product at the price the cashier typed", async () => {
    const result = await pushOne(app, s.tillA, draft(s.tillA, [typed(42_000)]));
    expect(result.status).toBe("accepted");
    expect(result.snapshot?.lines[0]).toMatchObject({ unitPrice: 42_000, priceSource: "manual" });
  });

  it.each([
    ["without a typed price", () => [line(cake)], "DOMAIN_PRICING_ENTERED_PRICE_REQUIRED"],
    ["at a negative price", () => [typed(-1)], "DOMAIN_PRICING_NEGATIVE_ENTERED_PRICE"],
    [
      "a typed price on a product with a menu price",
      () => [line(s.menu.coffee.id, { enteredPrice: 1 })],
      "DOMAIN_PRICING_ENTERED_PRICE_NOT_ALLOWED",
    ],
  ])("refuses a line %s", async (_case, lines, code) => {
    expect((await pushOne(app, s.tillA, draft(s.tillA, lines()))).code).toBe(code);
  });

  it("asks a waiter for a manager's approval of the typed price", async () => {
    const result = await pushOne(app, s.tillB, draft(s.tillB, [typed(42_000)]));
    expect(result).toMatchObject({ status: "rejected", code: "SYNC_APPROVAL_REQUIRED" });
    const approvalId = await approve(app, s.tillB, managerId, { key: "open_price" });
    const approved = await pushOne(app, s.tillB, draft(s.tillB, [typed(42_000)], { approvalId }));
    expect(approved.status).toBe("accepted");
  });

  it("asks again only when a typed price changes, not when the draft is saved as it was", async () => {
    const cakeLine = typed(42_000);
    const approvalId = await approve(app, s.tillB, managerId, { key: "open_price" });
    const first = draft(s.tillB, [cakeLine], { approvalId });
    expect((await pushOne(app, s.tillB, first)).status).toBe("accepted");
    const orderId = orderIdOf(first);
    const asItWas = draft(s.tillB, [cakeLine, line(s.menu.coffee.id)], { orderId });
    expect((await pushOne(app, s.tillB, asItWas)).status).toBe("accepted");
    const cheaper = draft(s.tillB, [{ ...cakeLine, enteredPrice: 30_000 }], { orderId });
    expect((await pushOne(app, s.tillB, cheaper)).code).toBe("SYNC_APPROVAL_REQUIRED");
  });
});
