import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { requestApproval } from "../support/approval-requests";
import { expectStatus } from "../support/catalog-shop";
import { startShift } from "../support/staffed-shop";
import {
  approve,
  approvedAt,
  hireManager,
  justNow,
  openPriceOf,
  refundOf,
  signInAs,
} from "../support/sync-approvals";
import { line, pushOnTime, pushOne, saveDraft, tillsClock } from "../support/sync-commands";
import { type SyncShop, type Till, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");
const TEN_MINUTES = 10 * 60_000;
/** How far a till's clock may run behind the server's. */
const TWO_MINUTES = 2 * 60_000;

let pool: pg.Pool;
let app: FastifyInstance;
const clock = tillsClock();
let s: SyncShop;
let managerId: string;
let cashierOnB: { staffId: string; staffToken: string };
const cake = newId();

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock });
  s = await syncShop(app, pool);
  managerId = await hireManager(app, s);
  cashierOnB = { staffId: s.tillB.staffId, staffToken: s.tillB.staffToken };
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

/** A new order with one cake, and what a manager is shown to sell it at 42.000 đ. */
function cakeOrder() {
  const orderId = newId();
  const cakeLine = line(cake, { enteredPrice: 42_000 });
  return { orderId, cakeLine, action: openPriceOf(orderId, cakeLine.lineId, 42_000) };
}
type CakeOrder = ReturnType<typeof cakeOrder>;

/** A waiter's draft of `order`, typing its cake's price, relying on `approvalId`. */
function typedPrice(
  order: CakeOrder,
  approvalId: string,
  createdAt = justNow(),
  till: Till = s.tillB,
) {
  const sent = saveDraft(till, [order.cakeLine], { orderId: order.orderId });
  return { ...sent, createdAt, payload: { ...(sent.payload as object), approvalId } };
}

describe("an on-the-spot approval relied on by a command", () => {
  it("is good for one command only", async () => {
    const order = cakeOrder();
    const approvalId = await approve(app, s.tillB, managerId, order.action);
    expect((await pushOne(app, s.tillB, typedPrice(order, approvalId))).status).toBe("accepted");
    // Taken off the order and typed again, the price is new to it: the approval is spent.
    const taken = saveDraft(s.tillB, [line(s.menu.coffee.id)], { orderId: order.orderId });
    expect((await pushOne(app, s.tillB, { ...taken, createdAt: justNow() })).status).toBe(
      "accepted",
    );
    const again = await pushOne(app, s.tillB, typedPrice(order, approvalId));
    expect(again).toMatchObject({ status: "rejected", code: "SYNC_APPROVAL_ALREADY_USED" });
  });

  it("is given back when the command relying on it is refused for another reason", async () => {
    const order = cakeOrder();
    const approvalId = await approve(app, s.tillB, managerId, order.action);
    const first = saveDraft(s.tillB, [line(s.menu.coffee.id)]);
    expect((await pushOne(app, s.tillB, first)).status).toBe("accepted");
    const number = (first.payload as { deviceOrderNo: number }).deviceOrderNo;
    const taken = typedPrice(order, approvalId);
    const clash = { ...taken, payload: { ...(taken.payload as object), deviceOrderNo: number } };
    expect((await pushOne(app, s.tillB, clash)).code).toBe("SYNC_DEVICE_ORDER_NO_TAKEN");
    expect((await pushOne(app, s.tillB, typedPrice(order, approvalId))).status).toBe("accepted");
  });

  it("does not cover another action", async () => {
    const approvalId = await approve(app, s.tillB, managerId, refundOf(newId(), 29_000));
    const result = await pushOne(app, s.tillB, typedPrice(cakeOrder(), approvalId));
    expect(result).toMatchObject({ status: "rejected", code: "SYNC_APPROVAL_FOR_ANOTHER_ACTION" });
  });

  it("belongs to the staff member who asked for it", async () => {
    const order = cakeOrder();
    const asked = await requestApproval(app, s.tillB.deviceToken, cashierOnB.staffToken, {
      action: order.action,
      approverStaffId: managerId,
      approverPin: "4826",
    });
    const result = await pushOne(app, s.tillB, typedPrice(order, asked.body.approvalId));
    expect(result).toMatchObject({ status: "rejected", code: "SYNC_APPROVAL_NOT_FOR_THIS_STAFF" });
  });

  it("belongs to the till it was asked on", async () => {
    // The same waiter signs in on till A too and asks there.
    const shift = await startShift(app, s.tillA.deviceToken, s.tillB.staffId, "4826");
    const onTillA = {
      ...s.tillA,
      staffId: s.tillB.staffId,
      staffToken: shift.body.staffSessionToken,
    };
    const order = cakeOrder();
    const approvalId = await approve(app, onTillA, managerId, order.action);
    const result = await pushOne(app, s.tillB, typedPrice(order, approvalId));
    expect(result).toMatchObject({ status: "rejected", code: "SYNC_APPROVAL_NOT_FOR_THIS_STAFF" });
  });

  it("must exist in the till's own shop", async () => {
    const result = await pushOne(app, s.tillB, typedPrice(cakeOrder(), newId()));
    expect(result).toMatchObject({ status: "rejected", code: "SYNC_APPROVAL_NOT_FOUND" });
  });

  it("covers a command the till recorded up to ten minutes after it, or two before", async () => {
    const at = async (order: CakeOrder) => {
      const approvalId = await approve(app, s.tillB, managerId, order.action);
      return { approvalId, when: await approvedAt(pool, s.shop.tenantId, approvalId) };
    };
    const outcomes = [];
    for (const offset of [TEN_MINUTES, TEN_MINUTES + 1, -TWO_MINUTES, -TWO_MINUTES - 1]) {
      const order = cakeOrder();
      const { approvalId, when } = await at(order);
      const sent = typedPrice(order, approvalId, new Date(when + offset).toISOString());
      outcomes.push((await pushOnTime(app, s.tillB, clock, sent)).code ?? "accepted");
    }
    expect(outcomes).toEqual([
      "accepted",
      "SYNC_APPROVAL_EXPIRED",
      "accepted",
      "SYNC_APPROVAL_EXPIRED",
    ]);
  });
});
