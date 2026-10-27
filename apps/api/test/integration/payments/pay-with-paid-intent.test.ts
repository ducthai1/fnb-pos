import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  createIntent,
  draftOf39k,
  freshCode,
  intentOf,
  payByQr,
  recordTransfer,
} from "../support/payment-commands";
import {
  freshSecret,
  paymentApp,
  putWebhookSecret,
  sendFakeNotice,
} from "../support/payment-webhooks";
import { command, pushOne } from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
const secret = freshSecret();

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = paymentApp(pool).app;
  s = await syncShop(app, pool);
  await putWebhookSecret(app, s.shop.managerCookie, s.shop.branchId, "fake", secret);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

/**
 * A 39.000đ draft whose QR the customer paid `received` for while the till was offline:
 * the bank's notice reached the server first, and the intent is matched when it arrives.
 */
async function intentPaidWith(received: number) {
  const orderId = await draftOf39k(app, s);
  const contentCode = freshCode();
  await recordTransfer(pool, s.shop.tenantId, {
    branchId: s.shop.branchId,
    amount: received,
    content: `MBVCB.88213.${contentCode}.CT tu 0011`,
  });
  const result = await pushOne(
    app,
    s.tillA,
    createIntent(s.tillA, orderId, 39_000, { contentCode }),
  );
  expect(result.status).toBe("accepted");
  return { orderId, intentId: intentOf(result)?.id ?? "", status: intentOf(result)?.status };
}

const qrPaymentsOf = (orderId: string) =>
  withTenant(pool, s.shop.tenantId, async (client) => {
    const { rows } = await client.query(
      "SELECT method, amount::int AS amount, payment_intent_id FROM payment WHERE order_id = $1",
      [orderId],
    );
    return rows;
  });

describe("order.pay with a QR transfer", () => {
  it("pays with an intent a gateway's notice paid while the QR was up", async () => {
    const orderId = await draftOf39k(app, s);
    const made = await pushOne(app, s.tillA, createIntent(s.tillA, orderId, 39_000));
    const intent = intentOf(made);
    const notice = { reference: newId(), amount: 39_000, content: intent?.contentCode ?? "" };
    expect((await sendFakeNotice(app, s.shop.tenantId, secret, notice)).statusCode).toBe(200);
    const result = await pushOne(app, s.tillA, payByQr(s.tillA, orderId, intent?.id ?? "", 39_000));
    expect(result).toMatchObject({ status: "accepted", snapshot: { status: "paid" } });
    expect(await qrPaymentsOf(orderId)).toEqual([
      { method: "qr_transfer", amount: 39_000, payment_intent_id: intent?.id },
    ]);
  });

  it("pays with an intent the bank paid exactly, and links the payment to it", async () => {
    const { orderId, intentId, status } = await intentPaidWith(39_000);
    expect(status).toBe("paid");
    const result = await pushOne(app, s.tillA, payByQr(s.tillA, orderId, intentId, 39_000));
    expect(result.status).toBe("accepted");
    expect(result.snapshot).toMatchObject({ id: orderId, status: "paid" });
    expect(result.snapshot?.payments).toMatchObject([
      { method: "qr_transfer", amount: 39_000, paymentIntentId: intentId },
    ]);
    expect(await qrPaymentsOf(orderId)).toEqual([
      { method: "qr_transfer", amount: 39_000, payment_intent_id: intentId },
    ]);
  });

  it.each([
    ["still waiting for the transfer", null, "pending", "SYNC_PAYMENT_INTENT_NOT_PAID"],
    [
      "paid short, at the amount it asked",
      20_000,
      "partial",
      "SYNC_PAYMENT_INTENT_AMOUNT_MISMATCH",
    ],
  ])("refuses an intent %s, leaving the order a draft", async (_case, received, expected, code) => {
    const { orderId, intentId, status } =
      received === null
        ? await (async () => {
            const id = await draftOf39k(app, s);
            const made = await pushOne(app, s.tillA, createIntent(s.tillA, id, 39_000));
            return {
              orderId: id,
              intentId: intentOf(made)?.id ?? "",
              status: intentOf(made)?.status,
            };
          })()
        : await intentPaidWith(received);
    expect(status).toBe(expected);
    const result = await pushOne(app, s.tillA, payByQr(s.tillA, orderId, intentId, 39_000));
    expect(result).toMatchObject({ status: "rejected", code });
    expect(result.snapshot?.status).toBe("draft");
    expect(await qrPaymentsOf(orderId)).toEqual([]);
  });

  it("refuses the intent at another amount than it was paid for", async () => {
    const { orderId, intentId } = await intentPaidWith(39_000);
    const split = command(s.tillA, "order.pay", {
      orderId,
      payments: [
        { method: "qr_transfer", amount: 30_000, paymentIntentId: intentId },
        { method: "cash", amount: 9_000 },
      ],
      expectedAmountDue: 39_000,
    });
    const result = await pushOne(app, s.tillA, split);
    expect(result).toMatchObject({
      status: "rejected",
      code: "SYNC_PAYMENT_INTENT_AMOUNT_MISMATCH",
    });
    expect(await qrPaymentsOf(orderId)).toEqual([]);
  });

  it("refuses an intent another order's customer paid", async () => {
    const paid = await intentPaidWith(39_000);
    const otherOrder = await draftOf39k(app, s);
    const result = await pushOne(app, s.tillA, payByQr(s.tillA, otherOrder, paid.intentId, 39_000));
    expect(result).toMatchObject({
      status: "rejected",
      code: "SYNC_PAYMENT_INTENT_OF_ANOTHER_ORDER",
    });
    expect(await qrPaymentsOf(otherOrder)).toEqual([]);
  });

  it("refuses an intent of another branch as missing, telling nothing of it", async () => {
    const paid = await intentPaidWith(39_000);
    const till = s.otherBranchTill;
    const theirs = await draftOf39k(app, s, till);
    const result = await pushOne(app, till, payByQr(till, theirs, paid.intentId, 39_000));
    expect(result).toMatchObject({ status: "rejected", code: "SYNC_PAYMENT_INTENT_NOT_FOUND" });
  });
});
