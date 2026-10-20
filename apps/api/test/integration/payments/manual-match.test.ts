import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { signedInMember } from "../support/backoffice-accounts";
import {
  contentCodeOf,
  createIntent,
  draftOf39k,
  intentIdOf,
  latestIntent,
} from "../support/payment-commands";
import {
  freshSecret,
  paymentApp,
  putWebhookSecret,
  sendFakeNotice,
} from "../support/payment-webhooks";
import { createRole } from "../support/roles";
import { pullAll, pushOne } from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
const q1Secret = freshSecret();
const q3Secret = freshSecret();

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = paymentApp(pool).app;
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

/** A transfer whose content names no QR, as a customer who typed their own note sends. */
async function strayTransfer(amount: number, secret = q1Secret, content = "chuyen tien tra sua") {
  const reference = newId();
  await sendFakeNotice(app, s.shop.tenantId, secret, { reference, amount, content });
  return withTenant(pool, s.shop.tenantId, async (client) => {
    const { rows } = await client.query(
      "SELECT id FROM bank_transaction WHERE reference_code = $1",
      [reference],
    );
    return rows[0].id as string;
  });
}

const unmatched = (cookie = s.shop.managerCookie, branchId = s.shop.branchId) =>
  app.inject({
    method: "GET",
    url: `/payments/unmatched?branchId=${branchId}`,
    headers: { cookie },
  });
const match = (transactionId: string, intentId: string, cookie = s.shop.managerCookie) =>
  app.inject({
    method: "POST",
    url: "/payments/match",
    headers: { cookie },
    payload: { transactionId, intentId },
  });

describe("matching by hand", () => {
  it("lists the transfer nobody claimed beside the QRs still waiting", async () => {
    const { intentId } = await liveQr();
    const transactionId = await strayTransfer(39_000);
    const listed = await unmatched();
    expect(listed.statusCode).toBe(200);
    const body = listed.json();
    expect(body.transfers).toContainEqual(
      expect.objectContaining({
        id: transactionId,
        amount: 39_000,
        content: "chuyen tien tra sua",
      }),
    );
    expect(body.openIntents).toContainEqual(
      expect.objectContaining({ id: intentId, status: "pending" }),
    );
  });

  it("settles the QR by what came, tells the tills, logs who did it, and clears the list", async () => {
    const { intentId } = await liveQr();
    const transactionId = await strayTransfer(39_000);
    const matched = await match(transactionId, intentId);
    expect(matched.statusCode).toBe(200);
    expect(matched.json().intent).toMatchObject({
      id: intentId,
      status: "paid",
      receivedAmount: 39_000,
    });
    const { changes } = await pullAll(app, s.tillB);
    expect(latestIntent(changes, intentId)).toEqual(matched.json().intent);
    const body = (await unmatched()).json();
    expect(body.transfers.map((t: { id: string }) => t.id)).not.toContain(transactionId);
    const audit = await withTenant(
      pool,
      s.shop.tenantId,
      async (client) =>
        (await client.query("SELECT action FROM audit_log WHERE entity_id = $1", [intentId])).rows,
    );
    expect(audit).toEqual([{ action: "payment.matched_by_hand" }]);
  });

  it("settles a short transfer as partial, never as paid", async () => {
    const { intentId } = await liveQr();
    const matched = await match(await strayTransfer(20_000), intentId);
    expect(matched.json().intent).toMatchObject({ status: "partial", receivedAmount: 20_000 });
  });
});

describe("matching by hand refuses", () => {
  it("a transfer that already pays a QR", async () => {
    const first = await liveQr();
    const second = await liveQr();
    const transactionId = await strayTransfer(39_000);
    expect((await match(transactionId, first.intentId)).statusCode).toBe(200);
    const again = await match(transactionId, second.intentId);
    expect({ status: again.statusCode, body: again.json() }).toEqual({
      status: 409,
      body: { code: "API_PAYMENT_TRANSACTION_NOT_MATCHABLE" },
    });
  });

  it("a QR already paid", async () => {
    const { intentId, contentCode } = await liveQr();
    await sendFakeNotice(app, s.shop.tenantId, q1Secret, {
      reference: newId(),
      amount: 39_000,
      content: contentCode,
    });
    const again = await match(await strayTransfer(39_000), intentId);
    expect({ status: again.statusCode, body: again.json() }).toEqual({
      status: 409,
      body: { code: "API_PAYMENT_INTENT_NOT_MATCHABLE" },
    });
  });

  it("money that came into another branch's account", async () => {
    const { intentId } = await liveQr();
    const elsewhere = await match(await strayTransfer(39_000, q3Secret), intentId);
    expect({ status: elsewhere.statusCode, body: elsewhere.json() }).toEqual({
      status: 409,
      body: { code: "API_PAYMENT_BRANCH_MISMATCH" },
    });
  });

  it("a transfer or a QR that does not exist", async () => {
    const { intentId } = await liveQr();
    expect((await match(newId(), intentId)).json()).toEqual({
      code: "API_PAYMENT_TRANSACTION_NOT_FOUND",
    });
    expect((await match(await strayTransfer(39_000), newId())).json()).toEqual({
      code: "API_PAYMENT_INTENT_NOT_FOUND",
    });
  });

  it("anyone without the keys: a cashier lists nothing, a report reader matches nothing", async () => {
    const { intentId } = await liveQr();
    const transactionId = await strayTransfer(39_000);
    const cashier = await signedInMember(app, pool, s.shop.tenantId, {
      roleId: s.shop.roleIds.cashier,
    });
    expect((await unmatched(cashier.cookie)).statusCode).toBe(403);
    const readerRole = await createRole(
      pool,
      s.shop.tenantId,
      [{ key: "view_reports" }],
      "Kế toán",
    );
    const reader = await signedInMember(app, pool, s.shop.tenantId, { roleId: readerRole });
    expect((await unmatched(reader.cookie)).statusCode).toBe(200);
    expect((await match(transactionId, intentId, reader.cookie)).statusCode).toBe(403);
  });

  it("a branch of nowhere", async () => {
    const response = await unmatched(s.shop.managerCookie, newId());
    expect({ status: response.statusCode, body: response.json() }).toEqual({
      status: 404,
      body: { code: "API_BRANCH_NOT_FOUND" },
    });
  });
});
