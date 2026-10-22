import { newId, withTenant } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { signedInMember } from "../support/backoffice-accounts";
import { liveQrOf39k } from "../support/payment-commands";
import {
  freshSecret,
  paymentApp,
  putWebhookSecret,
  sendFakeNotice,
} from "../support/payment-webhooks";
import { closeTillShifts, rowsOf } from "../support/shift-commands";
import { BUSINESS_DATE, pay, pushOne } from "../support/sync-commands";
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

/** A shop whose customer paid 40.000 đ by QR for a 39.000 đ order the till took in cash. */
async function overpaidShop() {
  const s: SyncShop = await syncShop(app, pool);
  const secret = freshSecret();
  await putWebhookSecret(app, s.shop.managerCookie, s.shop.branchId, "fake", secret);
  const owner = await signedInMember(app, pool, s.shop.tenantId, { roleId: s.shop.roleIds.owner });
  const qr = await liveQrOf39k(app, s);
  await sendFakeNotice(app, s.shop.tenantId, secret, {
    reference: newId(),
    amount: 40_000,
    content: `CK ${qr.contentCode}`,
  });
  expect((await pushOne(app, s.tillA, pay(s.tillA, qr.orderId, 39_000))).status).toBe("accepted");
  const as = (method: "GET" | "POST", url: string, payload?: object) =>
    app.inject({ method, url, headers: { cookie: owner.cookie }, ...(payload ? { payload } : {}) });
  const day = `/branches/${s.shop.branchId}/day-close`;
  return {
    s,
    qr,
    /** The cashiers close their shifts, then the owner closes the day. */
    closeDay: async () => {
      await closeTillShifts(app, pool, s);
      return as("POST", day, { businessDate: BUSINESS_DATE });
    },
    dayStatus: async () => (await as("GET", `${day}?businessDate=${BUSINESS_DATE}`)).json(),
    handBack: () =>
      as("POST", `/payments/refund-due/${qr.intentId}`, { method: "cash", note: "Trả lại khách" }),
    liveQrRefunds: async () =>
      (
        await as(
          "GET",
          `/reports/daily-sales?branchId=${s.shop.branchId}&businessDate=${BUSINESS_DATE}`,
        )
      ).json().qrRefunds,
  };
}

describe("QR money handed back once its day was closed", () => {
  it("keeps the closed day's report as the close froze it, and lists the money beside it", async () => {
    const shop = await overpaidShop();
    const closed = await shop.closeDay();
    expect(closed.statusCode).toBe(201);
    const frozen = await shop.liveQrRefunds();
    expect(frozen).toEqual({ count: 0, amount: 0, byMethod: [] });

    const handed = await shop.handBack();
    expect(handed.statusCode).toBe(201);
    // The money went back that day, after its close: dated so, and marked so.
    expect(handed.json().refund).toMatchObject({ businessDate: BUSINESS_DATE, afterDayClose: true });
    expect(await shop.liveQrRefunds()).toEqual(frozen);
    expect((await shop.dayStatus()).qrRefundedAfterClose).toEqual([
      { intentId: shop.qr.intentId, amount: 40_000, method: "cash" },
    ]);
  });

  it("is on the day's report like any other while the day is open", async () => {
    const shop = await overpaidShop();
    const handed = await shop.handBack();
    expect(handed.json().refund).toMatchObject({ afterDayClose: false });
    expect((await shop.liveQrRefunds()).count).toBe(1);
    expect((await shop.dayStatus()).qrRefundedAfterClose).toEqual([]);
  });

  it("keeps the mark as the handing back stands: nobody can take it off later", async () => {
    const shop = await overpaidShop();
    expect((await shop.closeDay()).statusCode).toBe(201);
    expect((await shop.handBack()).statusCode).toBe(201);
    const unmark = withTenant(pool, shop.s.shop.tenantId, (client) =>
      client.query("UPDATE payment_intent SET refunded_after_day_close = false WHERE id = $1", [
        shop.qr.intentId,
      ]),
    );
    await expect(unmark).rejects.toThrow(/was handed back/);
    const stored = await rowsOf(
      pool,
      shop.s.shop.tenantId,
      "SELECT refunded_after_day_close AS after FROM payment_intent WHERE id = $1",
      [shop.qr.intentId],
    );
    expect(stored).toEqual([{ after: true }]);
  });
});
