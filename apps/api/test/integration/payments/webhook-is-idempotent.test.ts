import { randomInt } from "node:crypto";
import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { latestIntent, liveQrOf39k } from "../support/payment-commands";
import {
  freshSecret,
  paymentApp,
  putWebhookSecret,
  sendFakeNotice,
  transfersWithReference,
} from "../support/payment-webhooks";
import { pullAll } from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
const secret = freshSecret();

beforeAll(async () => {
  // Ten notices at once each hold a connection while they queue on the shop's feed lock.
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app"), max: 14 });
  app = paymentApp(pool).app;
  s = await syncShop(app, pool);
  const put = await putWebhookSecret(app, s.shop.managerCookie, s.shop.branchId, "fake", secret);
  expect(put.statusCode).toBe(204);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const liveQr = () => liveQrOf39k(app, s);

/** How many copies of the intent the feed holds in each status. */
async function feedCopiesOf(intentId: string) {
  const { changes } = await pullAll(app, s.tillB);
  const copies = changes.filter((c) => c.entity === "payment_intent" && c.entityId === intentId);
  return {
    paid: copies.filter((c) => (c.snapshot as { status: string }).status === "paid").length,
    latest: latestIntent(changes, intentId),
  };
}

describe("a gateway notice delivered again", () => {
  it("sent ten times is one transfer, and pays the QR once", async () => {
    const { intentId, contentCode } = await liveQr();
    const notice = { reference: newId(), amount: 39_000, content: `MBVCB.1 ${contentCode} CT` };
    for (let delivery = 0; delivery < 10; delivery += 1) {
      const response = await sendFakeNotice(app, s.shop.tenantId, secret, notice);
      expect({ status: response.statusCode, body: response.json() }).toEqual({
        status: 200,
        body: { success: true },
      });
    }
    expect(await transfersWithReference(pool, s.shop.tenantId, notice.reference)).toHaveLength(1);
    expect(await feedCopiesOf(intentId)).toEqual({
      paid: 1,
      latest: expect.objectContaining({ status: "paid", receivedAmount: 39_000, version: 2 }),
    });
  });

  it("ten copies arriving at once are still one transfer, paying the QR once", async () => {
    const { intentId, contentCode } = await liveQr();
    const notice = { reference: newId(), amount: 39_000, content: contentCode };
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => sendFakeNotice(app, s.shop.tenantId, secret, notice)),
    );
    expect(responses.map((response) => response.statusCode)).toEqual(Array(10).fill(200));
    expect(await transfersWithReference(pool, s.shop.tenantId, notice.reference)).toHaveLength(1);
    expect((await feedCopiesOf(intentId)).paid).toBe(1);
  });

  it("is told apart from another transfer of the same amount and content", async () => {
    const { contentCode } = await liveQr();
    const first = { reference: newId(), amount: 39_000, content: contentCode };
    const second = { ...first, reference: newId() };
    await sendFakeNotice(app, s.shop.tenantId, secret, first);
    await sendFakeNotice(app, s.shop.tenantId, secret, second);
    expect(await transfersWithReference(pool, s.shop.tenantId, second.reference)).toHaveLength(1);
  });

  it("from SePay, with the shop's API key, is one transfer however often it comes", async () => {
    const apiKey = freshSecret();
    const put = await putWebhookSecret(app, s.shop.managerCookie, s.shop.branchId, "sepay", apiKey);
    expect(put.statusCode).toBe(204);
    const { intentId, contentCode } = await liveQr();
    const id = randomInt(1, 2 ** 47);
    const notice = {
      id,
      gateway: "Vietcombank",
      transactionDate: "2026-10-20 10:01:30",
      accountNumber: "0011001234567",
      code: null,
      content: `${contentCode} Thanh toan`,
      transferType: "in",
      transferAmount: 39_000,
      accumulated: 1_039_000,
      subAccount: null,
      referenceCode: "FT26293123456",
      description: "",
    };
    for (let delivery = 0; delivery < 3; delivery += 1) {
      const response = await app.inject({
        method: "POST",
        url: `/webhooks/payments/sepay/${s.shop.tenantId}`,
        headers: { authorization: `Apikey ${apiKey}` },
        payload: notice,
      });
      expect(response.json()).toEqual({ success: true });
    }
    expect(await transfersWithReference(pool, s.shop.tenantId, String(id))).toHaveLength(1);
    expect((await feedCopiesOf(intentId)).latest).toMatchObject({ status: "paid" });
  });
});
