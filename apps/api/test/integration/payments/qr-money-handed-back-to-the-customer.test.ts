import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { signedInMember } from "../support/backoffice-accounts";
import { liveQrOf39k, payByQr } from "../support/payment-commands";
import {
  freshSecret,
  getUnmatched,
  paymentApp,
  putWebhookSecret,
  sendFakeNotice,
} from "../support/payment-webhooks";
import { rowsOf } from "../support/shift-commands";
import { BUSINESS_DATE, command, pay, pushOne } from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  ({ app } = paymentApp(pool));
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

interface BankShop extends SyncShop {
  secret: string;
  owner: { cookie: string; appUserId: string };
}

async function bankShop(): Promise<BankShop> {
  const s = await syncShop(app, pool);
  const secret = freshSecret();
  await putWebhookSecret(app, s.shop.managerCookie, s.shop.branchId, "fake", secret);
  const owner = await signedInMember(app, pool, s.shop.tenantId, { roleId: s.shop.roleIds.owner });
  return { ...s, secret, owner };
}

const customerPays = (s: BankShop, code: string, amount: number) =>
  sendFakeNotice(app, s.shop.tenantId, s.secret, {
    reference: newId(),
    amount,
    content: `CK ${code}`,
  });

/** A QR the customer paid 40.000đ for a 39.000đ order, which the till then took in cash. */
async function overpaidQr(s: BankShop) {
  const qr = await liveQrOf39k(app, s);
  await customerPays(s, qr.contentCode, 40_000);
  expect((await pushOne(app, s.tillA, pay(s.tillA, qr.orderId, 39_000))).status).toBe("accepted");
  return qr;
}

const handBack = (cookie: string, intentId: string, payload: Record<string, unknown>) =>
  app.inject({
    method: "POST",
    url: `/payments/refund-due/${intentId}`,
    headers: { cookie },
    payload,
  });
const inCash = { method: "cash", note: "Trả lại chị Lan ở quầy" };

const owedIds = async (s: BankShop) =>
  (
    (await getUnmatched(app, s.shop.managerCookie, s.shop.branchId)).json().refundDue as {
      id: string;
    }[]
  ).map((row) => row.id);

const reportOf = async (s: BankShop) =>
  (
    await app.inject({
      method: "GET",
      url: `/reports/daily-sales?branchId=${s.shop.branchId}&businessDate=${BUSINESS_DATE}`,
      headers: { cookie: s.shop.managerCookie },
    })
  ).json();

const handedBackAudit = (s: BankShop) =>
  rowsOf(
    pool,
    s.shop.tenantId,
    "SELECT actor_kind, actor_id, entity_id, payload FROM audit_log " +
      "WHERE action = 'payment.qr_money_handed_back'",
  );

describe("handing QR money no sale counts back to the customer", () => {
  it("records who, when, how much and how, takes it off the list and reports it beside the sales", async () => {
    const s = await bankShop();
    const qr = await overpaidQr(s);
    expect(await owedIds(s)).toContain(qr.intentId);
    const marked = await handBack(s.owner.cookie, qr.intentId, inCash);
    expect(marked.statusCode).toBe(201);
    expect(marked.json().refund).toMatchObject({
      intentId: qr.intentId,
      branchId: s.shop.branchId,
      amount: 40_000,
      method: "cash",
      note: inCash.note,
      businessDate: BUSINESS_DATE,
      refundedByAppUserId: s.owner.appUserId,
    });
    expect(await owedIds(s)).not.toContain(qr.intentId);
    expect(await handedBackAudit(s)).toMatchObject([
      {
        actor_kind: "app_user",
        actor_id: s.owner.appUserId,
        entity_id: qr.intentId,
        payload: { amount: "40000", method: "cash", businessDate: BUSINESS_DATE },
      },
    ]);
    const report = await reportOf(s);
    expect(report.qrRefunds).toEqual({
      count: 1,
      amount: 40_000,
      byMethod: [{ method: "cash", count: 1, amount: 40_000 }],
    });
    // Never a sale: the day still took 39.000đ, in cash, and gave nothing of it back.
    expect(report.sales.collected).toBe(39_000);
    expect(report.refunds.collected).toBe(0);
    expect(report.payments).toEqual([{ method: "cash", sales: 39_000, refunds: 0, net: 39_000 }]);
  });

  it("takes a short QR of a cancelled order back by transfer", async () => {
    const s = await bankShop();
    const qr = await liveQrOf39k(app, s);
    await customerPays(s, qr.contentCode, 20_000);
    const cancel = command(s.tillA, "order.cancel", {
      orderId: qr.orderId,
      reasonCode: "customer_left",
    });
    expect((await pushOne(app, s.tillA, cancel)).status).toBe("accepted");
    const sent = { method: "bank_transfer", note: "CK lại VCB 0123" };
    expect((await handBack(s.owner.cookie, qr.intentId, sent)).statusCode).toBe(201);
    expect((await reportOf(s)).qrRefunds.byMethod).toEqual([
      { method: "bank_transfer", count: 1, amount: 20_000 },
    ]);
  });

  it("happens once: of two markings sent together one is refused, and the first stands", async () => {
    const s = await bankShop();
    const qr = await overpaidQr(s);
    const both = await Promise.all([
      handBack(s.owner.cookie, qr.intentId, inCash),
      handBack(s.owner.cookie, qr.intentId, { method: "bank_transfer", note: "lần hai" }),
    ]);
    expect(both.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect(both.find((r) => r.statusCode === 409)?.json()).toEqual({
      code: "API_PAYMENT_ALREADY_HANDED_BACK",
    });
    const again = await handBack(s.owner.cookie, qr.intentId, inCash);
    expect([again.statusCode, again.json()]).toEqual([
      409,
      { code: "API_PAYMENT_ALREADY_HANDED_BACK" },
    ]);
    expect(await handedBackAudit(s)).toHaveLength(1);
    expect((await reportOf(s)).qrRefunds.count).toBe(1);
  });

  it("is refused for money a sale counts, money a till may still use, and a QR nothing came for", async () => {
    const s = await bankShop();
    const used = await liveQrOf39k(app, s);
    await customerPays(s, used.contentCode, 39_000);
    const byQr = payByQr(s.tillA, used.orderId, used.intentId, 39_000);
    expect((await pushOne(app, s.tillA, byQr)).status).toBe("accepted");
    const waiting = await liveQrOf39k(app, s);
    await customerPays(s, waiting.contentCode, 39_000);
    const unpaid = await liveQrOf39k(app, s);
    const notOwed = { code: "API_PAYMENT_NOT_OWED_TO_CUSTOMER" };
    for (const intentId of [used.intentId, waiting.intentId, unpaid.intentId]) {
      const refused = await handBack(s.owner.cookie, intentId, inCash);
      expect([refused.statusCode, refused.json()]).toEqual([409, notOwed]);
    }
    const missing = await handBack(s.owner.cookie, newId(), inCash);
    expect([missing.statusCode, missing.json()]).toEqual([
      404,
      { code: "API_PAYMENT_INTENT_NOT_FOUND" },
    ]);
    // The till still closes the waiting order with its QR.
    const closing = payByQr(s.tillA, waiting.orderId, waiting.intentId, 39_000);
    expect((await pushOne(app, s.tillA, closing)).status).toBe("accepted");
    expect(await handedBackAudit(s)).toEqual([]);
  });

  it("asks how the money went back and a note, and nothing else", async () => {
    const s = await bankShop();
    const qr = await overpaidQr(s);
    for (const payload of [
      { note: "x" },
      { method: "cash" },
      { method: "cash", note: "   " },
      { method: "voucher", note: "x" },
      { ...inCash, amount: 1 },
    ]) {
      expect((await handBack(s.owner.cookie, qr.intentId, payload)).statusCode).toBe(400);
    }
    expect((await handBack(s.owner.cookie, "not-a-uuid", inCash)).statusCode).toBe(400);
    expect(await owedIds(s)).toContain(qr.intentId);
  });
});
