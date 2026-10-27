import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createIntent, freshCode, intentOf, liveQrOf39k } from "../support/payment-commands";
import {
  freshSecret,
  getUnmatched,
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

const customerPays = async (code: string, amount: number) => {
  const notice = { reference: newId(), amount, content: `CK ${code}` };
  expect((await sendFakeNotice(app, s.shop.tenantId, secret, notice)).statusCode).toBe(200);
};

const owedIds = async () =>
  (
    (await getUnmatched(app, s.shop.managerCookie, s.shop.branchId)).json().refundDue as {
      id: string;
    }[]
  ).map((row) => row.id);

const payWith = (orderId: string, payments: Record<string, unknown>[]) =>
  pushOne(
    app,
    s.tillA,
    command(s.tillA, "order.pay", { orderId, payments, expectedAmountDue: 39_000 }),
  );

/** A 39.000đ order whose QR the customer paid 34.000đ for. */
async function shortQr() {
  const qr = await liveQrOf39k(app, s);
  await customerPays(qr.contentCode, 34_000);
  expect(await owedIds()).toContain(qr.intentId);
  return qr;
}

describe("a QR transfer that came short, finished at the counter", () => {
  it("closes the order with what the bank brought plus the rest in cash", async () => {
    const qr = await shortQr();
    const result = await payWith(qr.orderId, [
      { method: "qr_transfer", amount: 34_000, paymentIntentId: qr.intentId },
      { method: "cash", amount: 5_000 },
    ]);
    expect(result).toMatchObject({ status: "accepted", snapshot: { status: "paid" } });
    expect(await owedIds()).not.toContain(qr.intentId);
  });

  it("closes the order with a second QR asking exactly for the rest", async () => {
    const qr = await shortQr();
    const code = freshCode();
    const second = await pushOne(
      app,
      s.tillA,
      createIntent(s.tillA, qr.orderId, 5_000, { contentCode: code }),
    );
    expect(second.status).toBe("accepted");
    const secondId = intentOf(second)?.id ?? "";
    await customerPays(code, 5_000);
    const result = await payWith(qr.orderId, [
      { method: "qr_transfer", amount: 34_000, paymentIntentId: qr.intentId },
      { method: "qr_transfer", amount: 5_000, paymentIntentId: secondId },
    ]);
    expect(result).toMatchObject({ status: "accepted", snapshot: { status: "paid" } });
    expect(await owedIds()).not.toContain(qr.intentId);
  });

  it.each([
    ["the whole order again", 39_000],
    ["less than the rest", 4_000],
    ["more than the rest", 6_000],
  ])("refuses a second QR asking for %s", async (_case, amount) => {
    const qr = await shortQr();
    const result = await pushOne(app, s.tillA, createIntent(s.tillA, qr.orderId, amount));
    expect(result).toMatchObject({ status: "rejected", code: "DOMAIN_ORDER_TOTAL_MISMATCH" });
  });

  it("refuses the short QR put down at the amount it asked for, or a rest that misses", async () => {
    const qr = await shortQr();
    const asked = await payWith(qr.orderId, [
      { method: "qr_transfer", amount: 39_000, paymentIntentId: qr.intentId },
    ]);
    expect(asked).toMatchObject({
      status: "rejected",
      code: "SYNC_PAYMENT_INTENT_AMOUNT_MISMATCH",
    });
    const missing = await payWith(qr.orderId, [
      { method: "qr_transfer", amount: 34_000, paymentIntentId: qr.intentId },
      { method: "cash", amount: 4_000 },
    ]);
    expect(missing).toMatchObject({
      status: "rejected",
      code: "SYNC_PAYMENTS_DO_NOT_MATCH_AMOUNT_DUE",
    });
    expect(missing.snapshot?.status).toBe("draft");
    expect(await owedIds()).toContain(qr.intentId);
  });
});
