import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { ManualClock } from "../support/manual-clock";
import {
  SERVER_STARTS_AT,
  createIntent,
  draftOf39k,
  intentIdOf,
  liveQrOf39k,
} from "../support/payment-commands";
import {
  freshSecret,
  getUnmatched,
  paymentApp,
  putWebhookSecret,
  sendFakeNotice,
} from "../support/payment-webhooks";
import { rowsOf } from "../support/shift-commands";
import { pay, pushOne } from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");
const MINUTE = 60_000;
const WEEK = 7 * 24 * 60 * MINUTE;
const CODE_TAKEN = { status: "rejected", code: "SYNC_PAYMENT_CONTENT_CODE_TAKEN" };

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

/** `run` with the server's clock moved `millis` on, put back afterwards. */
async function later<T>(millis: number, run: () => Promise<T>): Promise<T> {
  clock.advance(millis);
  try {
    return await run();
  } finally {
    clock.advance(-millis);
  }
}

/** Another order's QR drawn with `contentCode`, as the till answered it. */
async function qrOfAnotherOrderWith(contentCode: string) {
  const sent = createIntent(s.tillA, await draftOf39k(app, s), 39_000, { contentCode });
  return { sent, made: await pushOne(app, s.tillA, sent) };
}

describe("a transfer code", () => {
  it("is not drawn again while an expired QR's late money waits, so it pays no other order", async () => {
    const old = await liveQrOf39k(app, s);
    const content = `CK ${old.contentCode}`;
    await later(16 * MINUTE, () =>
      sendFakeNotice(app, s.shop.tenantId, secret, { reference: newId(), amount: 39_000, content }),
    );
    expect(await statusOf(old.intentId)).toBe("expired");
    const { sent, made } = await qrOfAnotherOrderWith(old.contentCode);
    expect(made).toMatchObject(CODE_TAKEN);
    expect(await statusOf(intentIdOf(sent))).toBeUndefined();
    const listed = (await getUnmatched(app, s.shop.managerCookie, s.shop.branchId)).json();
    expect(listed.transfers).toContainEqual(expect.objectContaining({ content }));
  });

  it("is not drawn again after its QR was withdrawn", async () => {
    const old = await liveQrOf39k(app, s);
    expect((await pushOne(app, s.tillA, pay(s.tillA, old.orderId, 39_000))).status).toBe(
      "accepted",
    );
    expect((await qrOfAnotherOrderWith(old.contentCode)).made).toMatchObject(CODE_TAKEN);
  });

  it("is free again once its last QR ran out more than a week ago", async () => {
    const outcomes = [];
    for (const ranOutAgo of [WEEK - MINUTE, WEEK + MINUTE]) {
      const old = await liveQrOf39k(app, s);
      expect((await pushOne(app, s.tillA, pay(s.tillA, old.orderId, 39_000))).status).toBe(
        "accepted",
      );
      // The stored QR is made as old as it would be a week on; the server's clock stays,
      // so the till's staff session does too.
      await rowsOf(
        pool,
        s.shop.tenantId,
        "UPDATE payment_intent SET expires_at = $2 WHERE id = $1",
        [old.intentId, new Date(SERVER_STARTS_AT.getTime() - ranOutAgo)],
      );
      outcomes.push((await qrOfAnotherOrderWith(old.contentCode)).made.status);
    }
    expect(outcomes).toEqual(["rejected", "accepted"]);
  });
});
