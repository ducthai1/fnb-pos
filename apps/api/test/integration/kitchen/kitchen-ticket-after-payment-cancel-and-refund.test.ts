import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { hireManager, signInAs } from "../support/sync-approvals";
import {
  kitchenStation,
  sentStateOf,
  sentToKitchen,
  ticketLine,
} from "../support/kitchen-commands";
import { line, orderIdOf, pay, pushOne, saveDraft } from "../support/sync-commands";
import { cancel, refund } from "../support/sync-order-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
let bar: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  s = await syncShop(app, pool);
  bar = await kitchenStation(app, s);
  // Till B is the manager's, so a refund there needs nobody to approve it.
  await hireManager(app, s);
  await signInAs(app, s, s.tillB, "manager");
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const till = () => s.tillA;

/** One coffee (29.000 đ) on a draft; `paid` pays it in cash before anything is printed. */
async function oneCoffee(paid: boolean) {
  const coffee = line(s.menu.coffee.id);
  const draft = saveDraft(till(), [coffee]);
  expect((await pushOne(app, till(), draft)).status).toBe("accepted");
  const orderId = orderIdOf(draft);
  if (paid)
    expect((await pushOne(app, till(), pay(till(), orderId, 29_000))).status).toBe("accepted");
  return { orderId, coffee };
}

const sendCoffee = (orderId: string, lineId: string) =>
  pushOne(app, till(), sentToKitchen(till(), orderId, bar, [ticketLine(lineId, "1")]));

// A counter that takes the money first prints the bar's ticket after the payment.
describe("a kitchen ticket after the payment", () => {
  it("is recorded on the paid order, which stays paid and moves on a version", async () => {
    const { orderId, coffee } = await oneCoffee(true);
    const result = await sendCoffee(orderId, coffee.lineId);
    expect(result.status).toBe("accepted");
    expect(result.snapshot).toMatchObject({ status: "paid", version: 3 });
    expect(await sentStateOf(pool, s.shop.tenantId, orderId)).toEqual([
      { id: coffee.lineId, sent: "1.000", note: null },
    ]);
    expect((await sendCoffee(orderId, coffee.lineId)).code).toBe("SYNC_KITCHEN_NOT_OWED");
  });

  it("is refused once the order's books are posted", async () => {
    const { orderId, coffee } = await oneCoffee(true);
    await withTenant(pool, s.shop.tenantId, (client) =>
      client.query("UPDATE sales_order SET status = 'posted' WHERE id = $1", [orderId]),
    );
    expect((await sendCoffee(orderId, coffee.lineId)).code).toBe("SYNC_KITCHEN_ORDER_CLOSED");
  });
});

describe("a kitchen ticket for an order with nothing to make", () => {
  it("is refused on a cancelled order", async () => {
    const { orderId, coffee } = await oneCoffee(false);
    expect((await pushOne(app, till(), cancel(till(), orderId))).status).toBe("accepted");
    expect((await sendCoffee(orderId, coffee.lineId)).code).toBe("SYNC_KITCHEN_ORDER_CLOSED");
    expect(await sentStateOf(pool, s.shop.tenantId, orderId)).toEqual([
      { id: coffee.lineId, sent: "0.000", note: null },
    ]);
  });

  it("is refused on a refund, whose goods were made and paid for", async () => {
    const { orderId, coffee } = await oneCoffee(true);
    const refunded = refund(
      s.tillB,
      orderId,
      [{ lineId: coffee.lineId, quantity: "1", restock: false }],
      -29_000,
    );
    const answer = await pushOne(app, s.tillB, refunded);
    expect(answer.status).toBe("accepted");
    const refundId = (refunded.payload as { refundOrderId: string }).refundOrderId;
    const refundLine = answer.snapshot?.lines[0]?.id ?? "";
    expect((await sendCoffee(refundId, refundLine)).code).toBe("DOMAIN_KITCHEN_REFUND_ORDER");
  });
});
