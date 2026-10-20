import { withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  EXPIRES_AT,
  createIntent,
  draftOf39k,
  intentIdOf,
  intentOf,
  latestIntent,
} from "../support/payment-commands";
import { paymentApp } from "../support/payment-webhooks";
import { pay, pullAll, pushOne } from "../support/sync-commands";
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

const intentRows = (orderId: string) =>
  withTenant(pool, s.shop.tenantId, async (client) => {
    const { rows } = await client.query(
      "SELECT status, amount::int AS amount FROM payment_intent WHERE order_id = $1",
      [orderId],
    );
    return rows;
  });

describe("payment.create_intent", () => {
  it("records a QR for exactly what the order comes to, payable for 15 minutes", async () => {
    const orderId = await draftOf39k(app, s);
    const sent = createIntent(s.tillA, orderId, 39_000);
    const result = await pushOne(app, s.tillA, sent);
    expect(result.status).toBe("accepted");
    expect(intentOf(result)).toEqual({
      id: intentIdOf(sent),
      orderId,
      branchId: s.shop.branchId,
      amount: 39_000,
      contentCode: (sent.payload as { contentCode: string }).contentCode,
      status: "pending",
      expiresAt: EXPIRES_AT.toISOString(),
      receivedAmount: null,
      version: 1,
    });
  });

  it("puts the intent in the branch's feed, where the other till sees it", async () => {
    const orderId = await draftOf39k(app, s);
    const sent = createIntent(s.tillA, orderId, 39_000);
    const result = await pushOne(app, s.tillA, sent);
    const { changes } = await pullAll(app, s.tillB);
    expect(latestIntent(changes, intentIdOf(sent))).toEqual(result.snapshot);
    const elsewhere = await pullAll(app, s.otherBranchTill);
    expect(latestIntent(elsewhere.changes, intentIdOf(sent))).toBeUndefined();
  });
});

describe("payment.create_intent refuses", () => {
  it.each([
    ["less than the order comes to", 29_000],
    ["more than the order comes to", 49_000],
  ])("an amount %s, and keeps no intent", async (_case, amount) => {
    const orderId = await draftOf39k(app, s);
    const result = await pushOne(app, s.tillA, createIntent(s.tillA, orderId, amount));
    expect(result).toMatchObject({ status: "rejected", code: "DOMAIN_ORDER_TOTAL_MISMATCH" });
    expect(result.snapshot).toBeUndefined();
    expect(await intentRows(orderId)).toEqual([]);
  });

  it("an order already paid, whose bill is settled", async () => {
    const orderId = await draftOf39k(app, s);
    expect((await pushOne(app, s.tillA, pay(s.tillA, orderId, 39_000))).status).toBe("accepted");
    const result = await pushOne(app, s.tillA, createIntent(s.tillA, orderId, 39_000));
    expect(result).toMatchObject({ status: "rejected", code: "DOMAIN_ORDER_ALREADY_PAID" });
    expect(await intentRows(orderId)).toEqual([]);
  });

  it("an order of another branch, which it reads as missing", async () => {
    const orderId = await draftOf39k(app, s);
    const till = s.otherBranchTill;
    const result = await pushOne(app, till, createIntent(till, orderId, 39_000));
    expect(result).toMatchObject({ status: "rejected", code: "SYNC_ORDER_NOT_FOUND" });
    expect(await intentRows(orderId)).toEqual([]);
  });
});
