import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { draftOf39k } from "../support/payment-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";
import {
  fakeZaloPayApi,
  openWallet,
  putWallet,
  turnZaloPayOn,
  walletApp,
  walletIntentRow,
} from "../support/wallet-payments";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let zalopay: ReturnType<typeof fakeZaloPayApi>;
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  ({ app, zalopay } = walletApp(pool));
  s = await syncShop(app, pool);
  expect((await turnZaloPayOn(app, s.shop.managerCookie, s.shop.branchId)).statusCode).toBe(204);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe("opening a ZaloPay payment", () => {
  it("asks ZaloPay for the order's total as the server prices it, and answers what to scan", async () => {
    const orderId = await draftOf39k(app, s);
    const intentId = newId();
    const response = await openWallet(app, s.tillA, { intentId, orderId, amount: 39_000 });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({
      wallet: "zalopay",
      intent: { id: intentId, orderId, amount: 39_000, status: "pending" },
    });
    const row = await walletIntentRow(pool, s.shop.tenantId, intentId);
    expect(body.qrContent).toBe(`ZPQR-${row.gateway_ref}`);
    expect(row).toMatchObject({ wallet: "zalopay", amount: 39_000, wallet_qr: body.qrContent });
    expect(row.gateway_ref).toMatch(/^\d{6}_FNB[0-9A-HJKMNP-TV-Z]{8}$/);
    const asked = zalopay.created.find((form) => form.app_trans_id === row.gateway_ref);
    expect(asked).toMatchObject({ amount: "39000", app_id: "554" });
  });

  it("refuses a till that shows another total, and never asks ZaloPay", async () => {
    const orderId = await draftOf39k(app, s);
    const before = zalopay.created.length;
    const response = await openWallet(app, s.tillA, { intentId: newId(), orderId, amount: 30_000 });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ code: "DOMAIN_ORDER_TOTAL_MISMATCH" });
    expect(zalopay.created).toHaveLength(before);
  });

  it("opens one payment per order at a time, and gives the same one to a till asking again", async () => {
    const orderId = await draftOf39k(app, s);
    const intentId = newId();
    const first = await openWallet(app, s.tillA, { intentId, orderId, amount: 39_000 });
    expect(first.statusCode).toBe(201);
    const before = zalopay.created.length;
    const again = await openWallet(app, s.tillA, { intentId, orderId, amount: 39_000 });
    expect(again.statusCode).toBe(201);
    expect(again.json().qrContent).toBe(first.json().qrContent);
    const second = await openWallet(app, s.tillA, { intentId: newId(), orderId, amount: 39_000 });
    expect(second.json()).toEqual({ code: "SYNC_PAYMENT_INTENT_ALREADY_PENDING" });
    expect(zalopay.created).toHaveLength(before);
  });

  it("takes the payment down when ZaloPay refuses to open it", async () => {
    const orderId = await draftOf39k(app, s);
    const intentId = newId();
    zalopay.refuseCreate(true);
    try {
      const response = await openWallet(app, s.tillA, { intentId, orderId, amount: 39_000 });
      expect(response.statusCode).toBe(502);
      expect(response.json()).toEqual({ code: "API_WALLET_UNAVAILABLE" });
    } finally {
      zalopay.refuseCreate(false);
    }
    expect((await walletIntentRow(pool, s.shop.tenantId, intentId)).status).toBe("cancelled");
    const retry = await openWallet(app, s.tillA, { intentId: newId(), orderId, amount: 39_000 });
    expect(retry.statusCode).toBe(201);
  });

  it("is refused for a branch that has not turned ZaloPay on, or turned it off", async () => {
    const till = s.otherBranchTill;
    const orderId = await draftOf39k(app, s, till);
    const response = await openWallet(app, till, { intentId: newId(), orderId, amount: 39_000 });
    expect(response.json()).toEqual({ code: "API_WALLET_NOT_ENABLED" });
    const off = await putWallet(app, s.shop.managerCookie, s.shop.branchId, { enabled: false });
    expect(off.statusCode).toBe(204);
    try {
      const mine = await draftOf39k(app, s);
      const refused = await openWallet(app, s.tillA, {
        intentId: newId(),
        orderId: mine,
        amount: 39_000,
      });
      expect(refused.json()).toEqual({ code: "API_WALLET_NOT_ENABLED" });
    } finally {
      await putWallet(app, s.shop.managerCookie, s.shop.branchId, { enabled: true });
    }
  });

  it("is refused without the staff member signed in at the till", async () => {
    const orderId = await draftOf39k(app, s);
    const response = await openWallet(
      app,
      { ...s.tillA, staffToken: "not-a-session" },
      { intentId: newId(), orderId, amount: 39_000 },
    );
    expect(response.statusCode).toBe(401);
  });
});
