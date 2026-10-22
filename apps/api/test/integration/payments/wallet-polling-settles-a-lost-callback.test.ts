import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { draftOf39k } from "../support/payment-commands";
import type { ManualClock } from "../support/manual-clock";
import { type SyncShop, syncShop } from "../support/sync-shop";
import {
  type fakeZaloPayApi,
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
let zalopay: ReturnType<typeof fakeZaloPayApi>;
let clock: ManualClock;
let pollOnce: ReturnType<typeof walletApp>["pollOnce"];
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  ({ app, zalopay, clock, pollOnce } = walletApp(pool));
  s = await syncShop(app, pool);
  expect((await turnZaloPayOn(app, s.shop.managerCookie, s.shop.branchId)).statusCode).toBe(204);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

async function openPayment() {
  const orderId = await draftOf39k(app, s);
  const intentId = newId();
  expect((await openWallet(app, s.tillA, { intentId, orderId, amount: 39_000 })).statusCode).toBe(
    201,
  );
  const { gateway_ref: ref } = await walletIntentRow(pool, s.shop.tenantId, intentId);
  return { intentId, ref };
}

describe("asking ZaloPay about pending payments", () => {
  it("settles a payment whose callback never came, and a late callback changes nothing", async () => {
    const { intentId, ref } = await openPayment();
    clock.advance(6_000);
    await pollOnce();
    expect(zalopay.queries).toContain(ref);
    expect((await walletIntentRow(pool, s.shop.tenantId, intentId)).status).toBe("pending");
    zalopay.paid(ref, 39_000);
    clock.advance(60_000);
    await pollOnce();
    expect(await walletIntentRow(pool, s.shop.tenantId, intentId)).toMatchObject({
      status: "paid",
      received: 39_000,
    });
    const late = await zaloPayCallback(app, s.shop.tenantId, { ref, amount: 39_000 });
    expect(late.json()).toMatchObject({ return_code: 1 });
    expect(await walletTransfers(pool, s.shop.tenantId, ref)).toEqual([
      { gateway: "zalopay", amount: 39_000, heard_by: "query" },
    ]);
  });

  it("settles another amount as partial, never as paid", async () => {
    const { intentId, ref } = await openPayment();
    zalopay.paid(ref, 20_000);
    clock.advance(60_000);
    await pollOnce();
    expect((await walletIntentRow(pool, s.shop.tenantId, intentId)).status).toBe("partial");
  });

  it("expires a payment ZaloPay calls failed once its time is up, not before", async () => {
    const { intentId, ref } = await openPayment();
    zalopay.failed(ref);
    clock.advance(60_000);
    await pollOnce();
    expect((await walletIntentRow(pool, s.shop.tenantId, intentId)).status).toBe("pending");
    clock.advance(15 * 60_000);
    await pollOnce();
    expect((await walletIntentRow(pool, s.shop.tenantId, intentId)).status).toBe("expired");
  });
});
