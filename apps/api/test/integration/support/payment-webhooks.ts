import { randomBytes } from "node:crypto";
import { newId, withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { buildApp } from "../../../src/build-app";
import { PAYMENT_GATEWAYS } from "../../../src/payments/gateways/payment-gateways";
import { type FakeNotice, fakePaymentGateway } from "./fake-payment-gateway";
import { ManualClock } from "./manual-clock";
import { SERVER_STARTS_AT } from "./payment-commands";

/** The key tests seal gateway secrets with; never one a deployment uses. */
export const TEST_PAYMENT_SECRET_KEY = Buffer.alloc(32, 0x5a);

/**
 * The API as a test runs it, taking notices from the real gateways and the fake one. Its
 * clock stands a minute after the tills record their commands, so a QR they show is still
 * payable when a notice arrives; tests move it to let a QR expire.
 */
export function paymentApp(pool: pg.Pool) {
  const fake = fakePaymentGateway();
  const clock = new ManualClock(SERVER_STARTS_AT);
  const app = buildApp({
    pool,
    clock,
    paymentSecretKey: TEST_PAYMENT_SECRET_KEY,
    paymentGateways: [...PAYMENT_GATEWAYS, fake],
  });
  return { app, fake, clock };
}

/** A secret long enough for the route, new on every call. */
export const freshSecret = () => `s-${randomBytes(16).toString("hex")}`;

export function putWebhookSecret(
  app: FastifyInstance,
  cookie: string,
  branchId: string,
  gateway: string,
  secret: string,
) {
  return app.inject({
    method: "PUT",
    url: `/payments/webhook-secrets/${branchId}/${gateway}`,
    headers: { cookie },
    payload: { secret },
  });
}

/** Sends a fake gateway notice to the shop's webhook, signed with `secret`. */
export function sendFakeNotice(
  app: FastifyInstance,
  tenantRoute: string,
  secret: string,
  notice: FakeNotice,
) {
  return app.inject({
    method: "POST",
    url: `/webhooks/payments/fake/${tenantRoute}`,
    headers: { "x-fake-secret": secret },
    payload: notice,
  });
}

/** The tenant's recorded transfers with a reference, as the database holds them. */
export const transfersWithReference = (pool: pg.Pool, tenantId: string, reference: string) =>
  withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query(
      "SELECT branch_id, amount::int AS amount, content, transfer_type FROM bank_transaction " +
        "WHERE reference_code = $1",
      [reference],
    );
    return rows;
  });

/**
 * A transfer whose content names no QR, as a customer who typed their own note sends, into
 * the account of the branch `secret` belongs to. Returns its id.
 */
export async function strayTransfer(
  app: FastifyInstance,
  pool: pg.Pool,
  tenantId: string,
  secret: string,
  amount: number,
) {
  const reference = newId();
  const content = "chuyen tien tra sua";
  await sendFakeNotice(app, tenantId, secret, { reference, amount, content });
  return withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query(
      "SELECT id FROM bank_transaction WHERE reference_code = $1",
      [reference],
    );
    return rows[0].id as string;
  });
}

export const getUnmatched = (app: FastifyInstance, cookie: string, branchId: string) =>
  app.inject({
    method: "GET",
    url: `/payments/unmatched?branchId=${branchId}`,
    headers: { cookie },
  });

export const postMatch = (
  app: FastifyInstance,
  cookie: string,
  match: { transactionId: string; intentId: string },
) => app.inject({ method: "POST", url: "/payments/match", headers: { cookie }, payload: match });
