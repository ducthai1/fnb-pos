import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { requestApproval } from "../support/approval-requests";
import { expectStatus } from "../support/catalog-shop";
import { approve, hireManager, justNow, openPriceOf, signInAs } from "../support/sync-approvals";
import { type LineIntent, line, pushOne, saveDraft, tillsClock } from "../support/sync-commands";
import { type SyncShop, type Till, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
let managerId: string;
const cake = newId();

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: tillsClock() });
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

const typed = (price: number, overrides: Partial<LineIntent> = {}) =>
  line(cake, { enteredPrice: price, ...overrides });

function draft(
  till: Till,
  lines: LineIntent[],
  order: { orderId?: string; approvalId?: string } = {},
) {
  const sent = saveDraft(till, lines, order);
  const payload = { ...(sent.payload as object), approvalId: order.approvalId };
  return { ...sent, createdAt: justNow(), payload };
}

/** The manager approves line `lineId` of order `orderId` at `price` for the waiter on till B. */
const approvePrice = (orderId: string, lineId: string, price: number) =>
  approve(app, s.tillB, managerId, openPriceOf(orderId, lineId, price));

/** A waiter's new order with one cake typed at `price`, and the manager's approval of it. */
async function approvedCake(price: number, approvedPrice = price) {
  const orderId = newId();
  const cakeLine = typed(price);
  const approvalId = await approvePrice(orderId, cakeLine.lineId, approvedPrice);
  return { orderId, cakeLine, approvalId };
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
    ["above 100.000.000 đ", () => [typed(100_000_001)], "DOMAIN_PRICING_ENTERED_PRICE_TOO_LARGE"],
    [
      "a typed price on a product with a menu price",
      () => [line(s.menu.coffee.id, { enteredPrice: 1 })],
      "DOMAIN_PRICING_ENTERED_PRICE_NOT_ALLOWED",
    ],
  ])("refuses a line %s", async (_case, lines, code) => {
    expect((await pushOne(app, s.tillA, draft(s.tillA, lines()))).code).toBe(code);
  });

  it("asks a waiter for a manager's approval of the typed price on that line", async () => {
    const { orderId, cakeLine, approvalId } = await approvedCake(42_000);
    const alone = await pushOne(app, s.tillB, draft(s.tillB, [cakeLine], { orderId }));
    expect(alone).toMatchObject({ status: "rejected", code: "SYNC_APPROVAL_REQUIRED" });
    const approved = draft(s.tillB, [{ ...cakeLine, priceApprovalId: approvalId }], { orderId });
    expect((await pushOne(app, s.tillB, approved)).status).toBe("accepted");
  });

  it("takes the approval from the draft for a line that names none of its own", async () => {
    const { orderId, cakeLine, approvalId } = await approvedCake(42_000);
    const sent = draft(s.tillB, [cakeLine], { orderId, approvalId });
    expect((await pushOne(app, s.tillB, sent)).status).toBe("accepted");
  });

  it("refuses an approval of another typed price, line or order", async () => {
    const cheaper = await approvedCake(150_000, 15_000);
    const atAnotherPrice = draft(
      s.tillB,
      [{ ...cheaper.cakeLine, priceApprovalId: cheaper.approvalId }],
      { orderId: cheaper.orderId },
    );
    expect((await pushOne(app, s.tillB, atAnotherPrice)).code).toBe(
      "SYNC_APPROVAL_FOR_ANOTHER_ACTION",
    );

    const other = await approvedCake(42_000);
    const anotherLine = typed(42_000, { priceApprovalId: other.approvalId });
    const onAnotherLine = draft(s.tillB, [anotherLine], { orderId: other.orderId });
    expect((await pushOne(app, s.tillB, onAnotherLine)).code).toBe(
      "SYNC_APPROVAL_FOR_ANOTHER_SUBJECT",
    );
    const sameLine = { ...other.cakeLine, priceApprovalId: other.approvalId };
    const onAnotherOrder = draft(s.tillB, [sameLine], { orderId: newId() });
    expect((await pushOne(app, s.tillB, onAnotherOrder)).code).toBe(
      "SYNC_APPROVAL_FOR_ANOTHER_SUBJECT",
    );
    // Still unused after those refusals: on its own line and price it goes through.
    const asApproved = draft(s.tillB, [sameLine], { orderId: other.orderId });
    expect((await pushOne(app, s.tillB, asApproved)).status).toBe("accepted");
  });

  it("needs one approval per typed line: one approval does not cover two cakes", async () => {
    const orderId = newId();
    const first = typed(42_000);
    const second = typed(42_000);
    const approvalId = await approvePrice(orderId, first.lineId, 42_000);
    const both = draft(s.tillB, [first, second], { orderId, approvalId });
    expect((await pushOne(app, s.tillB, both)).code).toBe("SYNC_APPROVAL_FOR_ANOTHER_SUBJECT");
    const secondApproval = await approvePrice(orderId, second.lineId, 42_000);
    const each = draft(
      s.tillB,
      [
        { ...first, priceApprovalId: approvalId },
        { ...second, priceApprovalId: secondApproval },
      ],
      { orderId },
    );
    expect((await pushOne(app, s.tillB, each)).status).toBe("accepted");
  });

  it("asks again only when a typed price changes, not when the draft is saved as it was", async () => {
    const { orderId, cakeLine, approvalId } = await approvedCake(42_000);
    const first = draft(s.tillB, [{ ...cakeLine, priceApprovalId: approvalId }], { orderId });
    expect((await pushOne(app, s.tillB, first)).status).toBe("accepted");
    const asItWas = draft(s.tillB, [cakeLine, line(s.menu.coffee.id)], { orderId });
    expect((await pushOne(app, s.tillB, asItWas)).status).toBe("accepted");
    const cheaper = { ...cakeLine, enteredPrice: 30_000 };
    expect((await pushOne(app, s.tillB, draft(s.tillB, [cheaper], { orderId }))).code).toBe(
      "SYNC_APPROVAL_REQUIRED",
    );
    // The first approval was for 42.000 đ and is spent; the new price needs its own.
    const stale = draft(s.tillB, [{ ...cheaper, priceApprovalId: approvalId }], { orderId });
    expect((await pushOne(app, s.tillB, stale)).code).toBe("SYNC_APPROVAL_FOR_ANOTHER_ACTION");
    const again = await approvePrice(orderId, cakeLine.lineId, 30_000);
    const changed = draft(s.tillB, [{ ...cheaper, priceApprovalId: again }], { orderId });
    expect((await pushOne(app, s.tillB, changed)).status).toBe("accepted");
  });

  it("will not give an approval of a typed price that names no line or no price", async () => {
    const ask = (action: object) =>
      requestApproval(app, s.tillB.deviceToken, s.tillB.staffToken, {
        action,
        approverStaffId: managerId,
        approverPin: "4826",
      });
    const noLine = await ask({ key: "open_price", enteredPrice: "42000" });
    expect(noLine).toMatchObject({ status: 400, body: { code: "API_APPROVAL_SUBJECT_REQUIRED" } });
    const noPrice = await ask({ key: "open_price", subject: { orderId: newId(), lineId: newId() } });
    expect(noPrice.status).toBe(400);
  });
});
