import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { ManualClock } from "../support/manual-clock";
import {
  EXPIRES_AT,
  SERVER_STARTS_AT,
  contentCodeOf,
  createIntent,
  draftOf39k,
  intentIdOf,
  intentOf,
  recordTransfer,
} from "../support/payment-commands";
import {
  freshSecret,
  paymentApp,
  putWebhookSecret,
  sendFakeNotice,
} from "../support/payment-webhooks";
import { rowsOf } from "../support/shift-commands";
import { RECORDED_AT, pushOne } from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");
const MINUTE = 60_000;

let pool: pg.Pool;
let app: FastifyInstance;
let clock: ManualClock;
let s: SyncShop;
const secret = freshSecret();

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  ({ app, clock } = paymentApp(pool));
  s = await syncShop(app, pool);
  await putWebhookSecret(app, s.shop.managerCookie, s.shop.branchId, "fake", secret);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const statusOf = async (intentId: string) =>
  (
    await rowsOf(pool, s.shop.tenantId, "SELECT status FROM payment_intent WHERE id = $1", [
      intentId,
    ])
  )[0]?.status as string | undefined;

const customerPays = (code: string) =>
  sendFakeNotice(app, s.shop.tenantId, secret, {
    reference: newId(),
    amount: 39_000,
    content: code,
  });

/** A QR for a fresh 39.000đ draft, dated by a till whose clock is `offset` ms off. */
async function qrFromTillOff(offset: number) {
  const orderId = await draftOf39k(app, s);
  const createdAt = new Date(Date.parse(RECORDED_AT) + offset).toISOString();
  const sent = createIntent(s.tillA, orderId, 39_000, { createdAt });
  const made = await pushOne(app, s.tillA, sent);
  expect(made.status).toBe("accepted");
  return { sent, made };
}

describe("a QR's fifteen minutes run from when the server heard of it", () => {
  it("so a till twenty minutes slow still has its customer's transfer matched", async () => {
    const { sent, made } = await qrFromTillOff(-20 * MINUTE);
    expect(intentOf(made)?.expiresAt).toBe(EXPIRES_AT.toISOString());
    clock.advance(MINUTE);
    try {
      await customerPays(contentCodeOf(sent));
    } finally {
      clock.advance(-MINUTE);
    }
    expect(await statusOf(intentIdOf(sent))).toBe("paid");
  });

  it("so a till a minute fast gets fifteen minutes from when the server heard of it", async () => {
    const { made } = await qrFromTillOff(MINUTE);
    expect(intentOf(made)?.expiresAt).toBe(EXPIRES_AT.toISOString());
  });

  it("while a till a day fast is refused before its QR exists, so it is never payable", async () => {
    const orderId = await draftOf39k(app, s);
    const createdAt = new Date(Date.parse(RECORDED_AT) + 24 * 60 * MINUTE).toISOString();
    const sent = createIntent(s.tillA, orderId, 39_000, { createdAt });
    expect(await pushOne(app, s.tillA, sent)).toMatchObject({
      status: "rejected",
      code: "SYNC_DEVICE_CLOCK_AHEAD",
    });
    await customerPays(contentCodeOf(sent));
    expect(await statusOf(intentIdOf(sent))).toBeUndefined();
  });

  it("while a transfer that came before a till synced its QR, slow clock or not, still pays it", async () => {
    const orderId = await draftOf39k(app, s);
    const sent = createIntent(s.tillA, orderId, 39_000, {
      createdAt: new Date(Date.parse(RECORDED_AT) - 60 * MINUTE).toISOString(),
    });
    await recordTransfer(pool, s.shop.tenantId, {
      branchId: s.shop.branchId,
      amount: 39_000,
      content: contentCodeOf(sent),
      receivedAt: new Date(SERVER_STARTS_AT.getTime() - 30 * MINUTE),
    });
    const made = await pushOne(app, s.tillA, sent);
    expect(intentOf(made)).toMatchObject({ status: "paid", receivedAmount: 39_000 });
  });
});
