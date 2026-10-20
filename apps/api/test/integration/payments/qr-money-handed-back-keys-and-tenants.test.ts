import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { signedInMember } from "../support/backoffice-accounts";
import { liveQrOf39k } from "../support/payment-commands";
import {
  freshSecret,
  getUnmatched,
  paymentApp,
  putWebhookSecret,
  sendFakeNotice,
} from "../support/payment-webhooks";
import { createRole } from "../support/roles";
import { pay, pushOne } from "../support/sync-commands";
import { type SyncShop, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
let intentId: string;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  ({ app } = paymentApp(pool));
  s = await syncShop(app, pool);
  const secret = freshSecret();
  await putWebhookSecret(app, s.shop.managerCookie, s.shop.branchId, "fake", secret);
  const qr = await liveQrOf39k(app, s);
  const notice = { reference: newId(), amount: 50_000, content: `CK ${qr.contentCode}` };
  await sendFakeNotice(app, s.shop.tenantId, secret, notice);
  await pushOne(app, s.tillA, pay(s.tillA, qr.orderId, 39_000));
  intentId = qr.intentId;
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const handBack = (cookie: string, id = intentId) =>
  app.inject({
    method: "POST",
    url: `/payments/refund-due/${id}`,
    headers: { cookie },
    payload: { method: "cash", note: "Trả lại khách" },
  });

const stillOwed = async () =>
  (
    (await getUnmatched(app, s.shop.managerCookie, s.shop.branchId)).json().refundDue as {
      id: string;
    }[]
  ).some((row) => row.id === intentId);

const memberWith = async (keys: string[]) => {
  const roleId = await createRole(
    pool,
    s.shop.tenantId,
    keys.map((key) => ({ key }) as never),
  );
  return (await signedInMember(app, pool, s.shop.tenantId, { roleId })).cookie;
};

describe("who may mark QR money handed back", () => {
  it("needs both view_reports and manage_settings; a shift manager or cashier is refused", async () => {
    const refusedCookies = [
      await memberWith(["view_reports"]),
      await memberWith(["manage_settings"]),
      await memberWith(["refund", "view_reports"]),
      (await signedInMember(app, pool, s.shop.tenantId, { roleId: s.shop.roleIds.manager })).cookie,
      (await signedInMember(app, pool, s.shop.tenantId, { roleId: s.shop.roleIds.cashier })).cookie,
    ];
    for (const cookie of refusedCookies) expect((await handBack(cookie)).statusCode).toBe(403);
    expect(
      (await app.inject({ method: "POST", url: `/payments/refund-due/${intentId}` })).statusCode,
    ).toBe(401);
    expect(await stillOwed()).toBe(true);
    const allowed = await memberWith(["view_reports", "manage_settings"]);
    expect((await handBack(allowed)).statusCode).toBe(201);
    expect(await stillOwed()).toBe(false);
  });

  it("finds no QR of another organization, whatever the keys", async () => {
    const other = await syncShop(app, pool);
    const outsider = await handBack(other.shop.managerCookie);
    expect([outsider.statusCode, outsider.json()]).toEqual([
      404,
      { code: "API_PAYMENT_INTENT_NOT_FOUND" },
    ]);
  });
});

describe("a QR's money once marked handed back", () => {
  it("keeps its marking: the app cannot change it, while the rest of the row still moves", async () => {
    const write = (sql: string) =>
      withTenant(pool, s.shop.tenantId, (client) => client.query(sql, [intentId]));
    const marked = await write("SELECT refunded_at FROM payment_intent WHERE id = $1");
    expect(marked.rows[0].refunded_at).not.toBeNull();
    for (const change of [
      "refund_note = 'sửa lại'",
      "refund_method = 'bank_transfer'",
      "refunded_at = NULL, refunded_by_app_user_id = NULL, refund_method = NULL, " +
        "refund_note = NULL, refund_business_date = NULL",
    ]) {
      await expect(write(`UPDATE payment_intent SET ${change} WHERE id = $1`)).rejects.toThrow(
        /handed back/,
      );
    }
    const touched = await write("UPDATE payment_intent SET updated_at = now() WHERE id = $1");
    expect(touched.rowCount).toBe(1);
  });
});
