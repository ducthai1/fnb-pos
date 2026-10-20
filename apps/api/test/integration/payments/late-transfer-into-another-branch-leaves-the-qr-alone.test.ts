import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { ManualClock } from "../support/manual-clock";
import { liveQrOf39k } from "../support/payment-commands";
import {
  freshSecret,
  paymentApp,
  putWebhookSecret,
  sendFakeNotice,
} from "../support/payment-webhooks";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let clock: ManualClock;
let s: SyncShop;
/** The QR's own branch takes money into one account, the other branch into another. */
const ownSecret = freshSecret();
const otherSecret = freshSecret();

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  ({ app, clock } = paymentApp(pool));
  s = await syncShop(app, pool);
  const { managerCookie, branchId, otherBranchId } = s.shop;
  const own = await putWebhookSecret(app, managerCookie, branchId, "fake", ownSecret);
  const other = await putWebhookSecret(app, managerCookie, otherBranchId, "fake", otherSecret);
  expect([own.statusCode, other.statusCode]).toEqual([204, 204]);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const statusOf = (intentId: string) =>
  withTenant(pool, s.shop.tenantId, async (client) => {
    const { rows } = await client.query("SELECT status FROM payment_intent WHERE id = $1", [
      intentId,
    ]);
    return rows[0]?.status as string | undefined;
  });

/** 39.000 đ naming the QR, reaching `secret`'s account once the QR's time has run out. */
async function lateTransferNaming(contentCode: string, secret: string) {
  clock.advance(20 * 60_000);
  try {
    const sent = await sendFakeNotice(app, s.shop.tenantId, secret, {
      reference: newId(),
      amount: 39_000,
      content: contentCode,
    });
    expect(sent.statusCode).toBe(200);
  } finally {
    clock.advance(-20 * 60_000);
  }
}

describe("money naming a QR whose time ran out", () => {
  it("leaves the QR pending when it reached another branch's account", async () => {
    const qr = await liveQrOf39k(app, s);
    await lateTransferNaming(qr.contentCode, otherSecret);
    expect(await statusOf(qr.intentId)).toBe("pending");
  });

  it("expires the QR when it reached the QR's own branch", async () => {
    const qr = await liveQrOf39k(app, s);
    await lateTransferNaming(qr.contentCode, ownSecret);
    expect(await statusOf(qr.intentId)).toBe("expired");
  });
});
