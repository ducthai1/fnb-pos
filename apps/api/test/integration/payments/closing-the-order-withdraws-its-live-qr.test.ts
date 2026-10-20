import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  EXPIRES_AT,
  createIntent,
  draftOf39k,
  freshCode,
  intentIdOf,
  intentOf,
  latestIntent,
  recordTransfer,
} from "../support/payment-commands";
import { paymentApp } from "../support/payment-webhooks";
import { command, pay, pullAll, pushOne } from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = paymentApp(pool).app;
  s = await syncShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

async function draftWithLiveQr() {
  const orderId = await draftOf39k(app, s);
  const sent = createIntent(s.tillA, orderId, 39_000);
  expect((await pushOne(app, s.tillA, sent)).status).toBe("accepted");
  return { orderId, intentId: intentIdOf(sent) };
}

describe("an order closed another way", () => {
  it("withdraws its QR when paid in cash, so a late transfer cannot pay it twice", async () => {
    const { orderId, intentId } = await draftWithLiveQr();
    expect((await pushOne(app, s.tillA, pay(s.tillA, orderId, 39_000))).status).toBe("accepted");
    const { changes } = await pullAll(app, s.tillB);
    expect(latestIntent(changes, intentId)).toMatchObject({ status: "cancelled", version: 2 });
  });

  it("withdraws its QR when the draft is cancelled", async () => {
    const { orderId, intentId } = await draftWithLiveQr();
    const cancel = command(s.tillA, "order.cancel", { orderId, reasonCode: "customer_left" });
    expect((await pushOne(app, s.tillA, cancel)).status).toBe("accepted");
    const { changes } = await pullAll(app, s.tillB);
    expect(latestIntent(changes, intentId)).toMatchObject({ status: "cancelled" });
  });

  it("keeps the QR when the payment is refused, since the order is still open", async () => {
    const { orderId, intentId } = await draftWithLiveQr();
    const refused = await pushOne(app, s.tillA, pay(s.tillA, orderId, 29_000));
    expect(refused.status).toBe("rejected");
    const { changes } = await pullAll(app, s.tillB);
    expect(latestIntent(changes, intentId)).toMatchObject({ status: "pending", version: 1 });
  });
});

describe("a transfer that reached the server before its intent", () => {
  it("is not matched when it arrived after the QR's time ran out", async () => {
    const orderId = await draftOf39k(app, s);
    const contentCode = freshCode();
    await recordTransfer(pool, s.shop.tenantId, {
      branchId: s.shop.branchId,
      amount: 39_000,
      content: contentCode,
      receivedAt: EXPIRES_AT,
    });
    const made = await pushOne(
      app,
      s.tillA,
      createIntent(s.tillA, orderId, 39_000, { contentCode }),
    );
    expect(intentOf(made)).toMatchObject({ status: "pending", receivedAmount: null });
  });

  it("is not matched when it went into another branch's account", async () => {
    const orderId = await draftOf39k(app, s);
    const contentCode = freshCode();
    const branchId = s.shop.otherBranchId;
    await recordTransfer(pool, s.shop.tenantId, { branchId, amount: 39_000, content: contentCode });
    const made = await pushOne(
      app,
      s.tillA,
      createIntent(s.tillA, orderId, 39_000, { contentCode }),
    );
    expect(intentOf(made)).toMatchObject({ status: "pending" });
  });

  it("is never money that went out of the account", async () => {
    const orderId = await draftOf39k(app, s);
    const contentCode = freshCode();
    await recordTransfer(pool, s.shop.tenantId, {
      branchId: s.shop.branchId,
      amount: 39_000,
      content: contentCode,
      transferType: "out",
    });
    const made = await pushOne(
      app,
      s.tillA,
      createIntent(s.tillA, orderId, 39_000, { contentCode }),
    );
    expect(intentOf(made)).toMatchObject({ status: "pending" });
  });
});
