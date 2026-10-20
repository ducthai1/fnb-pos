import { randomBytes } from "node:crypto";
import {
  freshSecret,
  paymentApp,
  putWebhookSecret,
  sendFakeNotice,
} from "@fnb/api/test-support/payment-webhooks";
import { type SyncShop, syncShop } from "@fnb/api/test-support/sync-shop";
import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import { DOMAIN_VERSION } from "@fnb/domain";
import { contentCodeFromRandom } from "@fnb/domain/payment";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { LocalCommand } from "../../src";
import { scratchDirectory } from "../../src/local-store/local-store-test-support";
import { BUSINESS_DATE, RECORDED_AT, orderOf, pick, saveDraft } from "../support/order-commands";
import { injectHttpSend } from "../support/inject-http-send";
import { ScenarioTill } from "../support/scenario-till";
import { virtualClock } from "../support/virtual-clock";

// On a real disk under the package (see scratchDirectory): the till's writes fsync.
const dir = scratchDirectory("qr-intent");
let pool: pg.Pool;
let app: ReturnType<typeof paymentApp>["app"];
let shop: SyncShop;
const secret = freshSecret();

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(inject("testPostgres"), "app") });
  app = paymentApp(pool).app;
  shop = await syncShop(app, pool);
  await putWebhookSecret(app, shop.shop.managerCookie, shop.shop.branchId, "fake", secret);
});

afterAll(async () => {
  await app.close();
  await pool.end();
  dir.remove();
});

const envelope = (type: string, payload: Record<string, unknown>) => ({
  commandId: newId(),
  type,
  payload,
  businessDate: BUSINESS_DATE,
  domainVersion: DOMAIN_VERSION,
  createdAt: RECORDED_AT,
});

/** payment.create_intent for a 29.000đ coffee, shown pending on the till at once. */
function showQr(orderId: string): { command: LocalCommand; intentId: string; code: string } {
  const intentId = newId();
  const code = contentCodeFromRandom(randomBytes(8));
  const payload = { intentId, orderId, amount: 29_000, contentCode: code };
  const shown = { id: intentId, orderId, amount: 29_000, contentCode: code, status: "pending" };
  return {
    command: {
      ...envelope("payment.create_intent", payload),
      target: {
        entity: "payment_intent",
        entityId: intentId,
        optimistic: { ...shown, version: 1 },
      },
    },
    intentId,
    code,
  };
}

const intentShown = async (till: ScenarioTill, intentId: string) =>
  (await till.client.snapshot("payment_intent", intentId))?.snapshot;

const customerPays = (code: string, amount = 29_000) =>
  sendFakeNotice(app, shop.shop.tenantId, secret, { reference: newId(), amount, content: code });

describe("a till showing a VietQR", () => {
  it("sees the QR turn paid on its next pull, then closes the order with it", async () => {
    const till = new ScenarioTill(injectHttpSend(app), shop.tillA, {
      dir: dir.path,
      name: "online",
      seed: 21,
      clock: virtualClock().clock,
    });
    const orderId = newId();
    await till.client.enqueue(
      saveDraft({ id: orderId, deviceOrderNo: 1, base: null }, [pick(shop.menu.coffee.id, 29_000)]),
    );
    const qr = showQr(orderId);
    await till.client.enqueue(qr.command);
    await till.syncUntilIdle();
    expect(await intentShown(till, qr.intentId)).toMatchObject({ status: "pending", version: 1 });

    expect((await customerPays(qr.code)).statusCode).toBe(200);
    await till.syncUntilIdle();
    expect(await intentShown(till, qr.intentId)).toMatchObject({
      status: "paid",
      receivedAmount: 29_000,
      version: 2,
    });

    const order = orderOf(await till.client.snapshot("order", orderId))!;
    const payments = [{ method: "qr_transfer", amount: 29_000, paymentIntentId: qr.intentId }];
    await till.client.enqueue({
      ...envelope("order.pay", { orderId, payments, expectedAmountDue: 29_000 }),
      target: {
        entity: "order",
        entityId: orderId,
        optimistic: { ...order, status: "paid", version: order.version + 1, payments },
      },
    });
    const reports = await till.syncUntilIdle();
    expect(reports.flatMap((report) => report.rejected)).toEqual([]);
    expect(orderOf(await till.client.snapshot("order", orderId))).toMatchObject({
      status: "paid",
      payments: [{ method: "qr_transfer", amount: 29_000, paymentIntentId: qr.intentId }],
    });
    await till.close();
  });

  it("offline, learns the customer paid as soon as its QR reaches the server", async () => {
    const till = new ScenarioTill(injectHttpSend(app), shop.tillB, {
      dir: dir.path,
      name: "offline",
      seed: 22,
      clock: virtualClock().clock,
    });
    till.network.online = false;
    const orderId = newId();
    await till.client.enqueue(
      saveDraft({ id: orderId, deviceOrderNo: 1, base: null }, [pick(shop.menu.coffee.id, 29_000)]),
    );
    const qr = showQr(orderId);
    await till.client.enqueue(qr.command);
    // The bank tells the server before the till is back: nothing to match it to yet.
    expect((await customerPays(qr.code)).statusCode).toBe(200);
    expect(await intentShown(till, qr.intentId)).toMatchObject({ status: "pending" });

    till.network.online = true;
    await till.syncUntilIdle();
    expect(await intentShown(till, qr.intentId)).toMatchObject({ status: "paid", version: 2 });
    await till.close();
  });
});
