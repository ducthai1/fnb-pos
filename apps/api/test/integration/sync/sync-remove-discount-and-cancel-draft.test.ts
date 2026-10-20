import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { approve, hireManager } from "../support/sync-approvals";
import { line, orderIdOf, pay, pushOne, saveDraft, tillsClock } from "../support/sync-commands";
import {
  cancel,
  markSent,
  percentOffLine,
  removeDiscount,
  voidUnits,
  withApproval,
} from "../support/sync-order-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
let managerId: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: tillsClock() });
  s = await syncShop(app, pool);
  managerId = await hireManager(app, s);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

async function coffeeDraft() {
  const coffee = line(s.menu.coffee.id);
  const sent = saveDraft(s.tillA, [coffee]);
  expect((await pushOne(app, s.tillA, sent)).status).toBe("accepted");
  return { orderId: orderIdOf(sent), coffee };
}

const discountIdsOf = (sent: { payload: unknown }) =>
  (sent.payload as { discountLineIds: string[] }).discountLineIds;

describe("order.remove_discount", () => {
  it("takes the discount lines off, and the order is due in full again", async () => {
    const { orderId, coffee } = await coffeeDraft();
    const given = percentOffLine(s.tillA, orderId, coffee.lineId, 1_000);
    await pushOne(app, s.tillA, given);
    const result = await pushOne(
      app,
      s.tillA,
      removeDiscount(s.tillA, orderId, discountIdsOf(given)),
    );
    expect(result.snapshot?.lines.map((entry) => entry.lineType)).toEqual(["item"]);
    expect((await pushOne(app, s.tillA, pay(s.tillA, orderId, 29_000))).status).toBe("accepted");
  });

  it("refuses an id that is not a discount line of the order", async () => {
    const { orderId, coffee } = await coffeeDraft();
    const result = await pushOne(app, s.tillA, removeDiscount(s.tillA, orderId, [coffee.lineId]));
    expect(result).toMatchObject({ status: "rejected", code: "SYNC_DISCOUNT_LINE_NOT_FOUND" });
    expect(result.snapshot?.lines).toHaveLength(1);
  });
});

describe("order.cancel", () => {
  const cancelRecord = (orderId: string) =>
    withTenant(pool, s.shop.tenantId, async (client) => {
      const order = await client.query(
        "SELECT status, reason_code FROM sales_order WHERE id = $1",
        [orderId],
      );
      const audit = await client.query(
        "SELECT actor_id, payload FROM audit_log WHERE action = 'order.cancelled' AND entity_id = $1",
        [orderId],
      );
      return { order: order.rows, audit: audit.rows };
    });

  it("cancels a draft with its reason, and says who did it", async () => {
    const { orderId } = await coffeeDraft();
    const result = await pushOne(app, s.tillA, cancel(s.tillA, orderId, "customer_left"));
    expect(result.snapshot).toMatchObject({ status: "cancelled", reasonCode: "customer_left" });
    expect(await cancelRecord(orderId)).toEqual({
      order: [{ status: "cancelled", reason_code: "customer_left" }],
      audit: [{ actor_id: s.tillA.staffId, payload: { reasonCode: "customer_left" } }],
    });
    const edit = await pushOne(app, s.tillA, saveDraft(s.tillA, [], { orderId }));
    expect(edit.code).toBe("DOMAIN_ORDER_ALREADY_CANCELLED");
  });

  it("refuses while the kitchen has units nobody voided, and goes through once they are", async () => {
    const { orderId, coffee } = await coffeeDraft();
    await markSent(pool, s.shop.tenantId, coffee.lineId, "1");
    expect((await pushOne(app, s.tillA, cancel(s.tillA, orderId))).code).toBe(
      "SYNC_ORDER_HAS_SENT_ITEMS",
    );
    const approvalId = await approve(app, s.tillA, managerId, { key: "void_after_sent" });
    const voided = withApproval(voidUnits(s.tillA, orderId, coffee.lineId, "1"), approvalId);
    expect((await pushOne(app, s.tillA, voided)).status).toBe("accepted");
    // The kitchen was sent part of it: closing the unpaid order is a manager's call too.
    const closing = await approve(app, s.tillA, managerId, { key: "close_unpaid_table" });
    const cancelled = withApproval(cancel(s.tillA, orderId), closing);
    expect((await pushOne(app, s.tillA, cancelled)).status).toBe("accepted");
  });

  it("refuses a paid order, and one of another branch as if it did not exist", async () => {
    const { orderId } = await coffeeDraft();
    await pushOne(app, s.tillA, pay(s.tillA, orderId, 29_000));
    expect((await pushOne(app, s.tillA, cancel(s.tillA, orderId))).code).toBe(
      "DOMAIN_ORDER_ALREADY_PAID",
    );
    const theirs = saveDraft(s.otherBranchTill, [line(s.menu.coffee.id)]);
    await pushOne(app, s.otherBranchTill, theirs);
    expect((await pushOne(app, s.tillA, cancel(s.tillA, orderIdOf(theirs)))).code).toBe(
      "SYNC_ORDER_NOT_FOUND",
    );
  });
});
