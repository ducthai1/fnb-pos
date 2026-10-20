import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import {
  contentCodeOf,
  createIntent,
  draftOf39k,
  intentIdOf,
  intentOf,
  latestIntent,
} from "../support/payment-commands";
import { command, pullAll, pushOne } from "../support/sync-commands";
import { type SyncShop, type Till, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool });
  s = await syncShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const cancelIntent = (till: Till, intentId: string) =>
  command(till, "payment.cancel_intent", { intentId });

async function liveIntent(till: Till = s.tillA) {
  const orderId = await draftOf39k(app, s, till);
  const sent = createIntent(till, orderId, 39_000);
  expect((await pushOne(app, till, sent)).status).toBe("accepted");
  return { orderId, intentId: intentIdOf(sent), contentCode: contentCodeOf(sent) };
}

describe("one live QR per order", () => {
  it("refuses a second QR while the first is out", async () => {
    const { orderId } = await liveIntent();
    const second = await pushOne(app, s.tillB, createIntent(s.tillB, orderId, 39_000));
    expect(second).toMatchObject({
      status: "rejected",
      code: "SYNC_PAYMENT_INTENT_ALREADY_PENDING",
    });
  });

  it("shows a new QR once the first was taken down", async () => {
    const { orderId, intentId } = await liveIntent();
    expect((await pushOne(app, s.tillA, cancelIntent(s.tillA, intentId))).status).toBe("accepted");
    const again = await pushOne(app, s.tillA, createIntent(s.tillA, orderId, 39_000));
    expect(again.status).toBe("accepted");
  });

  it("refuses a code another live QR of the shop carries", async () => {
    const { contentCode } = await liveIntent();
    const orderId = await draftOf39k(app, s);
    const clash = await pushOne(
      app,
      s.tillA,
      createIntent(s.tillA, orderId, 39_000, { contentCode }),
    );
    expect(clash).toMatchObject({ status: "rejected", code: "SYNC_PAYMENT_CONTENT_CODE_TAKEN" });
  });

  it("refuses an intent id already taken by another intent", async () => {
    const { intentId } = await liveIntent();
    const orderId = await draftOf39k(app, s);
    const reused = await pushOne(
      app,
      s.tillA,
      createIntent(s.tillA, orderId, 39_000, { intentId }),
    );
    expect(reused).toMatchObject({ status: "rejected", code: "SYNC_PAYMENT_INTENT_ID_TAKEN" });
  });
});

describe("payment.cancel_intent", () => {
  it("takes the QR down, and every till of the branch learns of it", async () => {
    const { intentId } = await liveIntent();
    const result = await pushOne(app, s.tillA, cancelIntent(s.tillA, intentId));
    expect(intentOf(result)).toMatchObject({ id: intentId, status: "cancelled", version: 2 });
    const { changes } = await pullAll(app, s.tillB);
    expect(latestIntent(changes, intentId)).toEqual(result.snapshot);
  });

  it("refuses an intent no longer pending, answering with it as it stands", async () => {
    const { intentId } = await liveIntent();
    await pushOne(app, s.tillA, cancelIntent(s.tillA, intentId));
    const again = await pushOne(app, s.tillB, cancelIntent(s.tillB, intentId));
    expect(again).toMatchObject({
      status: "rejected",
      code: "DOMAIN_PAYMENT_INVALID_INTENT_TRANSITION",
    });
    expect(intentOf(again)).toMatchObject({ id: intentId, status: "cancelled" });
  });

  it("refuses an intent of another branch, or none, as missing", async () => {
    const { intentId } = await liveIntent();
    const till = s.otherBranchTill;
    const other = await pushOne(app, till, cancelIntent(till, intentId));
    expect(other).toMatchObject({ status: "rejected", code: "SYNC_PAYMENT_INTENT_NOT_FOUND" });
    expect(other.snapshot).toBeUndefined();
    const none = await pushOne(app, s.tillA, cancelIntent(s.tillA, newId()));
    expect(none).toMatchObject({ status: "rejected", code: "SYNC_PAYMENT_INTENT_NOT_FOUND" });
  });
});
