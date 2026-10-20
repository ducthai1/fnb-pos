import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { ManualClock } from "../support/manual-clock";
import {
  contentCodeOf,
  createIntent,
  draftOf39k,
  freshCode,
  intentIdOf,
  latestIntent,
} from "../support/payment-commands";
import {
  freshSecret,
  paymentApp,
  putWebhookSecret,
  sendFakeNotice,
} from "../support/payment-webhooks";
import { pullAll, pushOne } from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let clock: ManualClock;
let s: SyncShop;
const q1Secret = freshSecret();
const q3Secret = freshSecret();

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  ({ app, clock } = paymentApp(pool));
  s = await syncShop(app, pool);
  const { managerCookie, branchId, otherBranchId } = s.shop;
  await putWebhookSecret(app, managerCookie, branchId, "fake", q1Secret);
  await putWebhookSecret(app, managerCookie, otherBranchId, "fake", q3Secret);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

async function liveQr() {
  const orderId = await draftOf39k(app, s);
  const sent = createIntent(s.tillA, orderId, 39_000);
  expect((await pushOne(app, s.tillA, sent)).status).toBe("accepted");
  return { intentId: intentIdOf(sent), contentCode: contentCodeOf(sent) };
}

/** A transfer into Q1's account (or Q3's, with its secret), as the gateway reports it. */
async function transfer(amount: number, content: string, secret = q1Secret) {
  const response = await sendFakeNotice(app, s.shop.tenantId, secret, {
    reference: newId(),
    amount,
    content,
  });
  expect(response.statusCode).toBe(200);
}

const intentNow = async (intentId: string) =>
  latestIntent((await pullAll(app, s.tillA)).changes, intentId);

describe("a transfer naming a live QR", () => {
  it.each([
    ["exactly the amount", 39_000, "paid"],
    ["less than the amount", 20_000, "partial"],
    ["more than the amount", 50_000, "overpaid"],
  ])("settles it as %s", async (_case, amount, status) => {
    const { intentId, contentCode } = await liveQr();
    await transfer(amount, `MBVCB.9921.${contentCode}.CT tu 0011`);
    expect(await intentNow(intentId)).toMatchObject({ status, receivedAmount: amount });
  });

  it("is found however the bank wrote the code", async () => {
    const { intentId, contentCode } = await liveQr();
    const mangled = `${contentCode.slice(0, 6).toLowerCase()} ${contentCode.slice(6)} chuyen tien`;
    await transfer(39_000, mangled);
    expect(await intentNow(intentId)).toMatchObject({ status: "paid" });
  });
});

describe("a transfer is left for a person when", () => {
  it("a second one comes for a QR already paid, which stays paid once", async () => {
    const { intentId, contentCode } = await liveQr();
    await transfer(39_000, contentCode);
    await transfer(39_000, contentCode);
    expect(await intentNow(intentId)).toMatchObject({ status: "paid", version: 2 });
  });

  it("it names two QRs, since either could be the one meant", async () => {
    const first = await liveQr();
    const second = await liveQr();
    await transfer(39_000, `${first.contentCode} ${second.contentCode}`);
    expect(await intentNow(first.intentId)).toMatchObject({ status: "pending" });
    expect(await intentNow(second.intentId)).toMatchObject({ status: "pending" });
  });

  it("it names no QR the shop has out", async () => {
    const { intentId } = await liveQr();
    await transfer(39_000, `${freshCode()} chuyen tien`);
    expect(await intentNow(intentId)).toMatchObject({ status: "pending" });
  });

  it("it went into another branch's account than the QR named", async () => {
    const { intentId, contentCode } = await liveQr();
    await transfer(39_000, contentCode, q3Secret);
    expect(await intentNow(intentId)).toMatchObject({ status: "pending", version: 1 });
  });

  it("it came after the QR's time ran out, which expires the QR", async () => {
    const { intentId, contentCode } = await liveQr();
    clock.advance(15 * 60_000);
    try {
      await transfer(39_000, contentCode);
    } finally {
      clock.advance(-15 * 60_000);
    }
    expect(await intentNow(intentId)).toMatchObject({ status: "expired", receivedAmount: null });
  });
});
