import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { draftOf39k, payByQr } from "../support/payment-commands";
import { freshSecret, putWebhookSecret, sendFakeNotice } from "../support/payment-webhooks";
import { pushOne } from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";
import {
  openWallet,
  turnZaloPayOn,
  walletApp,
  walletIntentRow,
  walletTransfers,
  zaloPayCallback,
} from "../support/wallet-payments";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  ({ app } = walletApp(pool));
  s = await syncShop(app, pool);
  expect((await turnZaloPayOn(app, s.shop.managerCookie, s.shop.branchId)).statusCode).toBe(204);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

/** A 39.000đ draft with a ZaloPay payment open for it. */
async function openPayment() {
  const orderId = await draftOf39k(app, s);
  const intentId = newId();
  const opened = await openWallet(app, s.tillA, { intentId, orderId, amount: 39_000 });
  expect(opened.statusCode).toBe(201);
  const { gateway_ref: ref } = await walletIntentRow(pool, s.shop.tenantId, intentId);
  return { orderId, intentId, ref };
}

describe("ZaloPay's callback", () => {
  it("settles the payment once, and the till closes the order with it", async () => {
    const { orderId, intentId, ref } = await openPayment();
    const first = await zaloPayCallback(app, s.shop.tenantId, { ref, amount: 39_000 });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ return_code: 1, return_message: "success" });
    expect(await walletIntentRow(pool, s.shop.tenantId, intentId)).toMatchObject({
      status: "paid",
      received: 39_000,
    });
    const again = await zaloPayCallback(app, s.shop.tenantId, { ref, amount: 39_000 });
    expect(again.json()).toEqual({ return_code: 1, return_message: "success" });
    expect(await walletTransfers(pool, s.shop.tenantId, ref)).toEqual([
      { gateway: "zalopay", amount: 39_000, heard_by: "callback" },
    ]);
    const paid = await pushOne(app, s.tillA, payByQr(s.tillA, orderId, intentId, 39_000));
    expect(paid).toMatchObject({ status: "accepted", snapshot: { status: "paid" } });
  });

  it("never closes the order with a payment of another amount", async () => {
    const { orderId, intentId, ref } = await openPayment();
    await zaloPayCallback(app, s.shop.tenantId, { ref, amount: 30_000 });
    expect(await walletIntentRow(pool, s.shop.tenantId, intentId)).toMatchObject({
      status: "partial",
      received: 30_000,
    });
    const refused = await pushOne(app, s.tillA, payByQr(s.tillA, orderId, intentId, 39_000));
    expect(refused).toMatchObject({
      status: "rejected",
      code: "SYNC_PAYMENT_INTENT_AMOUNT_MISMATCH",
    });
  });

  it("refuses a callback not signed with the branch's key2, recording nothing", async () => {
    const { intentId, ref } = await openPayment();
    const forged = await zaloPayCallback(
      app,
      s.shop.tenantId,
      { ref, amount: 39_000 },
      "a-key2-nobody-gave-us",
    );
    expect(forged.statusCode).toBe(401);
    expect(forged.json()).toMatchObject({ return_code: -1 });
    expect((await walletIntentRow(pool, s.shop.tenantId, intentId)).status).toBe("pending");
    expect(await walletTransfers(pool, s.shop.tenantId, ref)).toEqual([]);
  });

  it("refuses a callback sent to a shop that does not exist like a forged one", async () => {
    const { ref } = await openPayment();
    const stranger = await zaloPayCallback(app, newId(), { ref, amount: 39_000 });
    expect(stranger.statusCode).toBe(401);
  });

  it("is the only word that settles a wallet payment: a bank transfer naming its code does not", async () => {
    const secret = freshSecret();
    await putWebhookSecret(app, s.shop.managerCookie, s.shop.branchId, "fake", secret);
    const { intentId } = await openPayment();
    const { content_code: code } = await walletIntentRow(pool, s.shop.tenantId, intentId);
    const notice = { reference: newId(), amount: 39_000, content: `CT ${code}` };
    expect((await sendFakeNotice(app, s.shop.tenantId, secret, notice)).statusCode).toBe(200);
    expect((await walletIntentRow(pool, s.shop.tenantId, intentId)).status).toBe("pending");
  });

  it("keeps a proven payment for no pending intent, without applying it", async () => {
    const ref = "261022_FNB0000STRAY";
    const response = await zaloPayCallback(app, s.shop.tenantId, { ref, amount: 25_000 });
    expect(response.json()).toMatchObject({ return_code: 1 });
    expect(await walletTransfers(pool, s.shop.tenantId, ref)).toEqual([
      { gateway: "zalopay", amount: 25_000, heard_by: "callback" },
    ]);
    const unmatched = await app.inject({
      method: "GET",
      url: `/payments/unmatched?branchId=${s.shop.branchId}`,
      headers: { cookie: s.shop.managerCookie },
    });
    expect(unmatched.json().transfers).toEqual(
      expect.arrayContaining([expect.objectContaining({ gateway: "zalopay", amount: 25_000 })]),
    );
  });
});
