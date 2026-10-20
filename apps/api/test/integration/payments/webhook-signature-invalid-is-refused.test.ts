import { createHmac } from "node:crypto";
import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { payosSignedText } from "../../../src/payments/gateways/payos-gateway";
import { signedInMember } from "../support/backoffice-accounts";
import type { fakePaymentGateway } from "../support/fake-payment-gateway";
import {
  freshSecret,
  paymentApp,
  putWebhookSecret,
  sendFakeNotice,
  transfersWithReference,
} from "../support/payment-webhooks";
import { type StaffedShop, staffedShop } from "../support/staffed-shop";

const info = inject("testPostgres");
const REFUSED = { status: 401, body: { code: "API_PAYMENT_NOTICE_NOT_AUTHENTICATED" } };

let pool: pg.Pool;
let app: FastifyInstance;
let fake: ReturnType<typeof fakePaymentGateway>;
let shop: StaffedShop;
let otherShop: StaffedShop;
const secret = freshSecret();
const otherSecret = freshSecret();

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  ({ app, fake } = paymentApp(pool));
  shop = await staffedShop(app, pool);
  otherShop = await staffedShop(app, pool);
  await putWebhookSecret(app, shop.managerCookie, shop.branchId, "fake", secret);
  await putWebhookSecret(app, otherShop.managerCookie, otherShop.branchId, "fake", otherSecret);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const notice = () => ({ reference: newId(), amount: 39_000, content: "FNB7K2M9QXA" });
const answer = (response: { statusCode: number; json: () => unknown }) => ({
  status: response.statusCode,
  body: response.json(),
});

describe("a notice that does not prove itself", () => {
  it.each([
    ["signed with no secret of the shop", () => "s-not-the-shops-secret-000000"],
    ["signed with another shop's secret", () => otherSecret],
  ])("is refused when %s, before anything reads it", async (_case, signer) => {
    const sent = notice();
    const before = fake.parsed.length;
    expect(answer(await sendFakeNotice(app, shop.tenantId, signer(), sent))).toEqual(REFUSED);
    expect(fake.parsed.length).toBe(before);
    expect(await transfersWithReference(pool, shop.tenantId, sent.reference)).toEqual([]);
  });

  it("is refused without its signature header", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/webhooks/payments/fake/${shop.tenantId}`,
      payload: notice(),
    });
    expect(answer(response)).toEqual(REFUSED);
  });

  it.each([
    ["a shop that does not exist", () => newId()],
    ["a path that names no shop", () => "pho-sang"],
  ])("gets the same refusal for %s", async (_case, route) => {
    expect(answer(await sendFakeNotice(app, route(), secret, notice()))).toEqual(REFUSED);
  });

  it("proves itself and is kept when signed with the shop's secret", async () => {
    const sent = notice();
    expect(answer(await sendFakeNotice(app, shop.tenantId, secret, sent)).status).toBe(200);
    expect(await transfersWithReference(pool, shop.tenantId, sent.reference)).toEqual([
      { branch_id: shop.branchId, amount: 39_000, content: "FNB7K2M9QXA", transfer_type: "in" },
    ]);
  });
});

describe("PayOS notices", () => {
  const checksumKey = freshSecret();
  const data = () => ({
    orderCode: 1,
    amount: 39_000,
    description: "FNB7K2M9QXA",
    reference: `FT${newId()}`,
    transactionDateTime: "2026-10-20 10:01:00",
    code: "00",
  });
  const sendPayos = (body: object) =>
    app.inject({ method: "POST", url: `/webhooks/payments/payos/${shop.tenantId}`, payload: body });
  const signed = (d: Record<string, unknown>) =>
    createHmac("sha256", checksumKey).update(payosSignedText(d)).digest("hex");

  beforeAll(async () => {
    await putWebhookSecret(app, shop.managerCookie, shop.branchId, "payos", checksumKey);
  });

  it("takes data signed with the channel's checksum key", async () => {
    const d = data();
    const response = await sendPayos({ code: "00", desc: "ok", data: d, signature: signed(d) });
    expect(answer(response)).toEqual({ status: 200, body: { success: true } });
    expect(await transfersWithReference(pool, shop.tenantId, d.reference)).toHaveLength(1);
  });

  it("refuses data changed after it was signed", async () => {
    const d = data();
    const signature = signed(d);
    const response = await sendPayos({ code: "00", data: { ...d, amount: 3_900_000 }, signature });
    expect(answer(response)).toEqual(REFUSED);
    expect(await transfersWithReference(pool, shop.tenantId, d.reference)).toEqual([]);
  });
});

describe("the webhook also refuses", () => {
  it("a gateway it does not know", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/webhooks/payments/casso/${shop.tenantId}`,
      payload: {},
    });
    expect(answer(response)).toEqual({
      status: 404,
      body: { code: "API_PAYMENT_UNKNOWN_GATEWAY" },
    });
  });

  it("a signed notice that is not in the gateway's format, keeping nothing", async () => {
    const response = await sendFakeNotice(app, shop.tenantId, secret, { amount: 1 } as never);
    expect(answer(response)).toEqual({
      status: 400,
      body: { code: "API_PAYMENT_NOTICE_UNREADABLE" },
    });
  });

  it("every notice when the server has no key to open the secrets with", async () => {
    const keyless = buildApp({ pool });
    const response = await keyless.inject({
      method: "POST",
      url: `/webhooks/payments/sepay/${shop.tenantId}`,
      payload: {},
    });
    expect(answer(response)).toEqual({
      status: 503,
      body: { code: "API_PAYMENTS_NOT_CONFIGURED" },
    });
    await keyless.close();
  });
});

describe("a branch's gateway secret", () => {
  it("is kept sealed, never as the secret itself", async () => {
    const rows = await withTenant(pool, shop.tenantId, async (client) => {
      const found = await client.query(
        "SELECT secret_ciphertext FROM payment_webhook_endpoint WHERE gateway = 'fake'",
      );
      return found.rows.map((row) => row.secret_ciphertext as string);
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatch(/^v1\./);
    expect(rows[0]).not.toContain(secret);
  });

  it("is set only by someone who may manage settings", async () => {
    const cashier = await signedInMember(app, pool, shop.tenantId, {
      roleId: shop.roleIds.cashier,
    });
    const response = await putWebhookSecret(
      app,
      cashier.cookie,
      shop.branchId,
      "fake",
      freshSecret(),
    );
    expect(response.statusCode).toBe(403);
  });

  it("refuses a secret short enough to guess", async () => {
    const response = await putWebhookSecret(
      app,
      shop.managerCookie,
      shop.branchId,
      "fake",
      "short",
    );
    expect(response.statusCode).toBe(400);
  });

  it("refuses a branch of another shop, as missing", async () => {
    const branchId = otherShop.branchId;
    const response = await putWebhookSecret(
      app,
      shop.managerCookie,
      branchId,
      "fake",
      freshSecret(),
    );
    expect(answer(response)).toEqual({ status: 404, body: { code: "API_BRANCH_NOT_FOUND" } });
  });
});
