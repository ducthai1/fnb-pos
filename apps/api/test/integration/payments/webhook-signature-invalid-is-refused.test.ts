import { createHmac } from "node:crypto";
import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { payosSignedText } from "../../../src/payments/gateways/payos-gateway";
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
