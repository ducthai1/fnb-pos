import { createHmac } from "node:crypto";
import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { buildApp } from "../../../src/build-app";
import { PAYMENT_GATEWAYS } from "../../../src/payments/gateways/payment-gateways";
import { runWalletPollOnce } from "../../../src/payments/wallets/wallet-status-poller";
import { webhookSecretBox } from "../../../src/payments/webhook-secret-box";
import { type WalletFetch, zaloPayWallet } from "../../../src/payments/wallets/zalopay-wallet";
import { fakePaymentGateway } from "./fake-payment-gateway";
import { ManualClock } from "./manual-clock";
import { SERVER_STARTS_AT } from "./payment-commands";
import { TEST_PAYMENT_SECRET_KEY } from "./payment-webhooks";
import type { Till } from "./sync-shop";

/** Made-up ZaloPay keys: the stand-in below checks them, ZaloPay itself never sees them. */
export const TEST_ZALOPAY = { appId: "554", key1: "made-up-key1-0001", key2: "made-up-key2-0001" };

type QueryAnswer = Record<string, unknown>;

/**
 * A stand-in for ZaloPay's v2 API, in process: create answers a QR (or refuses, when told
 * to), query answers what a test set for the payment (processing until then). It checks
 * each request's mac the way ZaloPay does, so a wrongly signed request fails the test.
 */
export function fakeZaloPayApi(keys: { appId: string; key1: string } = TEST_ZALOPAY) {
  const created: Record<string, string>[] = [];
  const queries: string[] = [];
  const answers = new Map<string, QueryAnswer>();
  let refuseCreate = false;
  const mac = (input: string) => createHmac("sha256", keys.key1).update(input).digest("hex");
  const fetch: WalletFetch = async (url, init) => {
    const form = Object.fromEntries(new URLSearchParams(String(init.body)));
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (url.endsWith("/v2/create")) {
      const input = [
        form.app_id,
        form.app_trans_id,
        form.app_user,
        form.amount,
        form.app_time,
        form.embed_data,
        form.item,
      ].join("|");
      if (form.mac !== mac(input)) return json({ return_code: 2, sub_return_code: -402 });
      if (refuseCreate) return json({ return_code: 2, sub_return_code: -500 });
      created.push(form);
      return json({ return_code: 1, order_url: "https://example.test/zp", qr_code: `ZPQR-${form.app_trans_id}` });
    }
    if (url.endsWith("/v2/query")) {
      const ref = form.app_trans_id ?? "";
      if (form.mac !== mac([form.app_id, ref, keys.key1].join("|"))) {
        return json({ return_code: -403 });
      }
      queries.push(ref);
      return json(answers.get(ref) ?? { return_code: 3, is_processing: true });
    }
    return new Response("not found", { status: 404 });
  };
  return {
    fetch,
    created,
    queries,
    refuseCreate(on: boolean) {
      refuseCreate = on;
    },
    /** ZaloPay will answer this payment as paid with `amount`. */
    paid(ref: string, amount: number, zpTransId = 261022000000001) {
      answers.set(ref, { return_code: 1, is_processing: false, amount, zp_trans_id: zpTransId });
    },
    failed(ref: string) {
      answers.set(ref, { return_code: 2 });
    },
  };
}

/** The API with ZaloPay pointed at the stand-in, and the clock tests move. */
export function walletApp(pool: pg.Pool) {
  const zalopay = fakeZaloPayApi();
  const clock = new ManualClock(SERVER_STARTS_AT);
  const wallets = [zaloPayWallet({ environment: "sandbox", fetch: zalopay.fetch })];
  const app = buildApp({
    pool,
    clock,
    paymentSecretKey: TEST_PAYMENT_SECRET_KEY,
    paymentGateways: [...PAYMENT_GATEWAYS, fakePaymentGateway()],
    wallets,
  });
  const pollOnce = () =>
    runWalletPollOnce({
      pool,
      clock,
      box: webhookSecretBox(TEST_PAYMENT_SECRET_KEY),
      wallets: new Map(wallets.map((wallet) => [wallet.wallet, wallet])),
    });
  return { app, zalopay, clock, pollOnce };
}

export function putWallet(
  app: FastifyInstance,
  cookie: string,
  branchId: string,
  payload: Record<string, unknown>,
  wallet = "zalopay",
) {
  return app.inject({
    method: "PUT",
    url: `/payments/wallets/${branchId}/${wallet}`,
    headers: { cookie },
    payload,
  });
}

export const turnZaloPayOn = (app: FastifyInstance, cookie: string, branchId: string) =>
  putWallet(app, cookie, branchId, { enabled: true, credentials: TEST_ZALOPAY });

export function openWallet(
  app: FastifyInstance,
  till: Till,
  body: { intentId: string; orderId: string; amount: number; wallet?: string },
) {
  return app.inject({
    method: "POST",
    url: "/pos/wallet-payments",
    headers: { authorization: `Device ${till.deviceToken}`, "x-staff-session": till.staffToken },
    payload: { wallet: "zalopay", ...body },
  });
}

/** ZaloPay's callback for a payment, signed with `key2` over its data string. */
export function zaloPayCallback(
  app: FastifyInstance,
  tenantId: string,
  payment: { ref: string; amount: number; zpTransId?: number },
  key2 = TEST_ZALOPAY.key2,
) {
  const data = JSON.stringify({
    app_id: Number(TEST_ZALOPAY.appId),
    app_trans_id: payment.ref,
    app_time: SERVER_STARTS_AT.getTime(),
    app_user: "fnb_pos",
    amount: payment.amount,
    embed_data: "{}",
    item: "[]",
    zp_trans_id: payment.zpTransId ?? 261022000000001,
    server_time: SERVER_STARTS_AT.getTime() + 30_000,
    channel: 38,
    merchant_user_id: "",
    user_fee_amount: 0,
    discount_amount: 0,
  });
  const mac = createHmac("sha256", key2).update(data).digest("hex");
  return app.inject({
    method: "POST",
    url: `/webhooks/wallets/zalopay/${tenantId}`,
    payload: { data, mac, type: 1 },
  });
}

/** The wallet intent as the database holds it, the columns tills never see included. */
export const walletIntentRow = (pool: pg.Pool, tenantId: string, intentId: string) =>
  withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query(
      "SELECT status, amount::int AS amount, received_amount::int AS received, wallet, " +
        "gateway_ref, wallet_qr, content_code FROM payment_intent WHERE id = $1",
      [intentId],
    );
    return rows[0] as {
      status: string;
      amount: number;
      received: number | null;
      wallet: string;
      gateway_ref: string;
      wallet_qr: string | null;
      content_code: string;
    };
  });

/** The wallet payments the tenant kept as money that came in, by reference. */
export const walletTransfers = (pool: pg.Pool, tenantId: string, ref: string) =>
  withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query(
      "SELECT gateway, amount::int AS amount, raw->>'heardBy' AS heard_by FROM bank_transaction " +
        "WHERE reference_code = $1",
      [ref],
    );
    return rows;
  });
