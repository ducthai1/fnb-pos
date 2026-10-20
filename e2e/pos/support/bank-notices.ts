import { randomBytes, randomInt } from "node:crypto";
import { buildApp } from "@fnb/api/build-app";
import { TEST_PAYMENT_SECRET_KEY, putWebhookSecret } from "@fnb/api/test-support/payment-webhooks";
import { withTenant } from "@fnb/db";
import type pg from "pg";
import { expect } from "vitest";
import type { PosStack } from "../../support/global-setup-start-pos-stack";

/**
 * The bank's side of a QR payment: SePay notices sent to the real webhook route, signed with
 * a secret the shop's manager stored. The stack's own API runs without a key to seal gateway
 * secrets, so this second instance of the same API, on the same database, takes them; what
 * it records reaches the tills through the change feed like any notice would.
 */
export async function sepayForBranch(stack: PosStack, pool: pg.Pool) {
  const app = buildApp({ pool, paymentSecretKey: TEST_PAYMENT_SECRET_KEY });
  const secret = `sepay-${randomBytes(16).toString("hex")}`;
  const stored = await putWebhookSecret(app, stack.managerCookie, stack.branchId, "sepay", secret);
  expect(stored.statusCode).toBe(204);
  return {
    /** One incoming transfer of `amount` described `content`, signed with `signedWith`. */
    async notify(amount: number, content: string, signedWith = secret) {
      // SePay states the time in Vietnam's local time, without a zone.
      const local = new Date(Date.now() + 7 * 3_600_000).toISOString();
      const response = await app.inject({
        method: "POST",
        url: `/webhooks/payments/sepay/${stack.tenantId}`,
        headers: { authorization: `Apikey ${signedWith}` },
        payload: {
          id: randomInt(1, 2 ** 47),
          transferType: "in",
          transferAmount: amount,
          content,
          transactionDate: `${local.slice(0, 10)} ${local.slice(11, 19)}`,
        },
      });
      return response.statusCode;
    },
    close: () => app.close(),
  };
}

export interface QrPaidSale {
  status: string;
  method: string;
  amount: number;
  paymentIntentId: string | null;
  intentStatus: string | null;
}

/** Each payment of the till's orders, with the QR it names, as the database holds them. */
export const qrPaidSalesOfTill = (pool: pg.Pool, tenantId: string, deviceId: string) =>
  withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query<QrPaidSale>(
      'SELECT o.status, p.method, p.amount::int AS amount, p.payment_intent_id AS "paymentIntentId", ' +
        'i.status AS "intentStatus" FROM sales_order o JOIN payment p ON p.order_id = o.id ' +
        "LEFT JOIN payment_intent i ON i.id = p.payment_intent_id WHERE o.device_id = $1",
      [deviceId],
    );
    return rows;
  });

/** The QR the server registered under a transfer code, once the till's command reached it. */
export const intentWithCode = (pool: pg.Pool, tenantId: string, contentCode: string) =>
  withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query<{ id: string; status: string; amount: number }>(
      "SELECT id, status, amount::int AS amount FROM payment_intent WHERE content_code = $1",
      [contentCode],
    );
    return rows[0] ?? null;
  });
