import { newId } from "@fnb/db";
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
import { closeTillShifts, expectedCashOf, rowsOf } from "../support/shift-commands";
import { pay, pushOne } from "../support/sync-commands";
import { type SyncShop, shiftOf, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
let owner: { cookie: string; appUserId: string };
const secret = freshSecret();

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  ({ app } = paymentApp(pool));
  s = await syncShop(app, pool);
  await putWebhookSecret(app, s.shop.managerCookie, s.shop.branchId, "fake", secret);
  owner = await signedInMember(app, pool, s.shop.tenantId, { roleId: s.shop.roleIds.owner });
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

/** A QR the customer paid 40.000đ for a 39.000đ order, which the till then took in cash. */
async function owedQr() {
  const qr = await liveQrOf39k(app, s);
  const notice = { reference: newId(), amount: 40_000, content: `CK ${qr.contentCode}` };
  expect((await sendFakeNotice(app, s.shop.tenantId, secret, notice)).statusCode).toBe(200);
  expect((await pushOne(app, s.tillA, pay(s.tillA, qr.orderId, 39_000))).status).toBe("accepted");
  return qr;
}

const handBack = (intentId: string, payload: Record<string, unknown>) =>
  app.inject({
    method: "POST",
    url: `/payments/refund-due/${intentId}`,
    headers: { cookie: owner.cookie },
    payload,
  });

describe("QR money handed back with cash from a shift's drawer", () => {
  it("lists the branch's open shifts to choose the drawer from", async () => {
    const listed = (await getUnmatched(app, s.shop.managerCookie, s.shop.branchId)).json();
    expect(listed.openShifts.map((shift: { id: string }) => shift.id)).toContain(shiftOf(s.tillA));
  });

  it("takes the cash out of that shift in the same step: it expects that much less", async () => {
    const qr = await owedQr();
    const before = await expectedCashOf(pool, s.shop.tenantId, shiftOf(s.tillA));
    const answer = await handBack(qr.intentId, {
      method: "cash_from_drawer",
      fromShiftId: shiftOf(s.tillA),
      note: "Trả lại anh Minh ở quầy",
    });
    expect(answer.statusCode).toBe(201);
    expect(answer.json().refund).toMatchObject({ amount: 40_000, method: "cash_from_drawer" });
    expect(await expectedCashOf(pool, s.shop.tenantId, shiftOf(s.tillA))).toBe(before - 40_000);
    expect(
      await rowsOf(
        pool,
        s.shop.tenantId,
        "SELECT kind, amount::int AS amount, app_user_id, staff_id FROM cash_move " +
          "WHERE payment_intent_id = $1",
        [qr.intentId],
      ),
    ).toEqual([{ kind: "out", amount: 40_000, app_user_id: owner.appUserId, staff_id: null }]);
  });

  it("refuses a drawer named for cash from outside one, or none for cash from one", async () => {
    const qr = await owedQr();
    const noShift = await handBack(qr.intentId, { method: "cash_from_drawer", note: "Trả lại" });
    expect(noShift.statusCode).toBe(400);
    const stray = await handBack(qr.intentId, {
      method: "cash",
      fromShiftId: shiftOf(s.tillA),
      note: "Trả lại",
    });
    expect(stray.statusCode).toBe(400);
  });

  it("refuses a closed shift's drawer, leaving the money owed and the shift as it closed", async () => {
    const qr = await owedQr();
    await closeTillShifts(app, pool, s, [s.tillB]);
    const answer = await handBack(qr.intentId, {
      method: "cash_from_drawer",
      fromShiftId: shiftOf(s.tillB),
      note: "Trả lại",
    });
    expect(answer.statusCode).toBe(409);
    expect(answer.json()).toEqual({ code: "API_PAYMENT_SHIFT_NOT_OPEN" });
    const owed = (await getUnmatched(app, s.shop.managerCookie, s.shop.branchId)).json().refundDue;
    expect(owed.map((row: { id: string }) => row.id)).toContain(qr.intentId);
  });
});
