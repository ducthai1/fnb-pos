import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { ManualClock } from "../support/manual-clock";
import { contentCodeOf, createIntent, liveQrOf39k, payByQr } from "../support/payment-commands";
import {
  freshSecret,
  getUnmatched,
  paymentApp,
  postMatch,
  putWebhookSecret,
  sendFakeNotice,
} from "../support/payment-webhooks";
import { command, pay, pushOne } from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let clock: ManualClock;
let s: SyncShop;
const secret = freshSecret();

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  ({ app, clock } = paymentApp(pool));
  s = await syncShop(app, pool);
  await putWebhookSecret(app, s.shop.managerCookie, s.shop.branchId, "fake", secret);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const SETTLED_QR = { status: "rejected", code: "SYNC_ORDER_HAS_SETTLED_QR" };
const ORDER_NOT_PAYABLE = { code: "API_PAYMENT_ORDER_NOT_PAYABLE" };

const customerPays = (code: string, amount = 39_000) =>
  sendFakeNotice(app, s.shop.tenantId, secret, {
    reference: newId(),
    amount,
    content: `CK ${code}`,
  });
const cashFor = (orderId: string) => pushOne(app, s.tillA, pay(s.tillA, orderId, 39_000));
const cancel = (orderId: string) =>
  pushOne(app, s.tillA, command(s.tillA, "order.cancel", { orderId, reasonCode: "customer_left" }));
const listed = async () =>
  (await getUnmatched(app, s.shop.managerCookie, s.shop.branchId)).json() as {
    transfers: { id: string; content: string }[];
    openIntents: { id: string }[];
    refundDue: { id: string }[];
  };
const ids = (rows: readonly { id: string }[]) => rows.map((row) => row.id);
const matchByHand = (transactionId: string, intentId: string) =>
  postMatch(app, s.shop.managerCookie, { transactionId, intentId });

/** A live QR whose customer paid after its time ran out: the transfer waits for a person. */
async function lateTransferForExpiredQr() {
  const qr = await liveQrOf39k(app, s);
  clock.advance(16 * 60_000);
  try {
    await customerPays(qr.contentCode);
  } finally {
    clock.advance(-16 * 60_000);
  }
  const transfer = (await listed()).transfers.find((t) => t.content === `CK ${qr.contentCode}`);
  if (transfer === undefined) throw new Error("the late transfer is not waiting for a person");
  return { ...qr, transactionId: transfer.id };
}

describe("an order whose QR the bank already paid", () => {
  it("is not paid again in cash, and the till still closes it with the QR", async () => {
    const qr = await liveQrOf39k(app, s);
    await customerPays(qr.contentCode);
    expect(await cashFor(qr.orderId)).toMatchObject(SETTLED_QR);
    const byQr = await pushOne(app, s.tillA, payByQr(s.tillA, qr.orderId, qr.intentId, 39_000));
    expect(byQr.status).toBe("accepted");
  });

  it("cannot be cancelled while it holds the customer's money", async () => {
    const qr = await liveQrOf39k(app, s);
    await customerPays(qr.contentCode);
    expect(await cancel(qr.orderId)).toMatchObject(SETTLED_QR);
  });

  it("gets no second QR for the customer to pay again", async () => {
    const qr = await liveQrOf39k(app, s);
    await customerPays(qr.contentCode);
    const again = await pushOne(app, s.tillA, createIntent(s.tillA, qr.orderId, 39_000));
    expect(again).toMatchObject(SETTLED_QR);
  });
});

describe("money the bank brought that no order counts", () => {
  it("is listed to refund when the order closed another way", async () => {
    const over = await liveQrOf39k(app, s);
    await customerPays(over.contentCode, 40_000);
    expect((await cashFor(over.orderId)).status).toBe("accepted");
    const short = await liveQrOf39k(app, s);
    await customerPays(short.contentCode, 20_000);
    expect((await cancel(short.orderId)).status).toBe("accepted");
    const { refundDue } = await listed();
    expect(refundDue).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: over.intentId, status: "overpaid", receivedAmount: 40_000 }),
        expect.objectContaining({ id: short.intentId, status: "partial", receivedAmount: 20_000 }),
      ]),
    );
  });

  it("leaves out a QR that paid its order and one the till is about to close it with", async () => {
    const used = await liveQrOf39k(app, s);
    await customerPays(used.contentCode);
    const paid = await pushOne(app, s.tillA, payByQr(s.tillA, used.orderId, used.intentId, 39_000));
    expect(paid.status).toBe("accepted");
    const waiting = await liveQrOf39k(app, s);
    await customerPays(waiting.contentCode);
    const refundIds = ids((await listed()).refundDue);
    expect(refundIds).not.toContain(used.intentId);
    expect(refundIds).not.toContain(waiting.intentId);
  });
});

describe("matching a late transfer by hand", () => {
  it("is refused for a QR of an order paid another way, and the transfer stays listed", async () => {
    const late = await lateTransferForExpiredQr();
    expect((await cashFor(late.orderId)).status).toBe("accepted");
    const matched = await matchByHand(late.transactionId, late.intentId);
    expect(matched.statusCode).toBe(409);
    expect(matched.json()).toEqual(ORDER_NOT_PAYABLE);
    const after = await listed();
    expect(ids(after.transfers)).toContain(late.transactionId);
    expect(ids(after.openIntents)).not.toContain(late.intentId);
  });

  it("is refused for a QR of a cancelled order", async () => {
    const late = await lateTransferForExpiredQr();
    expect((await cancel(late.orderId)).status).toBe("accepted");
    const matched = await matchByHand(late.transactionId, late.intentId);
    expect(matched.statusCode).toBe(409);
    expect(matched.json()).toEqual(ORDER_NOT_PAYABLE);
  });

  it("is refused when another QR of the order already brought its money", async () => {
    const late = await lateTransferForExpiredQr();
    const second = createIntent(s.tillA, late.orderId, 39_000);
    expect((await pushOne(app, s.tillA, second)).status).toBe("accepted");
    await customerPays(contentCodeOf(second));
    const matched = await matchByHand(late.transactionId, late.intentId);
    expect(matched.statusCode).toBe(409);
    expect(matched.json()).toEqual(ORDER_NOT_PAYABLE);
  });

  it("still settles an expired QR of an order that is open", async () => {
    const late = await lateTransferForExpiredQr();
    const matched = await matchByHand(late.transactionId, late.intentId);
    expect(matched.statusCode).toBe(200);
    expect(matched.json().intent).toMatchObject({ id: late.intentId, status: "paid" });
  });
});
