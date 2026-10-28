import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { liveQrOf39k, payByQr } from "../support/payment-commands";
import {
  freshSecret,
  getUnmatched,
  paymentApp,
  putWebhookSecret,
  sendFakeNotice,
} from "../support/payment-webhooks";
import {
  CASHIER_PIN,
  expectedCashOf,
  freshTill,
  openedShift,
  rowsOf,
} from "../support/shift-commands";
import { hire } from "../support/staffed-shop";
import { approve, hireManager } from "../support/sync-approvals";
import { command, pushOne } from "../support/sync-commands";
import { type SyncShop, shiftOf, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;
const secret = freshSecret();

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = paymentApp(pool).app;
  s = await syncShop(app, pool);
  await putWebhookSecret(app, s.shop.managerCookie, s.shop.branchId, "fake", secret);
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

const customerPays = async (code: string, amount: number) => {
  const notice = { reference: newId(), amount, content: `CK ${code}` };
  expect((await sendFakeNotice(app, s.shop.tenantId, secret, notice)).statusCode).toBe(200);
};

const owed = async () =>
  (await getUnmatched(app, s.shop.managerCookie, s.shop.branchId)).json().refundDue as {
    id: string;
    owedAmount?: number;
  }[];

const handBack = (intentId: string, amount: number) =>
  command(s.tillA, "payment.hand_back_excess", { intentId, cashMoveId: newId(), amount });

/** A 39.000đ order whose QR the customer paid 49.000đ for, closed with the QR. */
async function overpaidAndClosed() {
  const qr = await liveQrOf39k(app, s);
  await customerPays(qr.contentCode, 49_000);
  const paid = await pushOne(app, s.tillA, payByQr(s.tillA, qr.orderId, qr.intentId, 39_000));
  expect(paid).toMatchObject({ status: "accepted", snapshot: { status: "paid" } });
  return qr;
}

describe("a QR transfer that came over, the excess handed back from the drawer", () => {
  it("closes the order at its amount and lists only the excess as owed", async () => {
    const qr = await overpaidAndClosed();
    expect((await owed()).find((row) => row.id === qr.intentId)).toMatchObject({
      owedAmount: 10_000,
    });
  });

  it("hands the excess back in one command: the drawer pays it out, the QR is marked", async () => {
    const qr = await overpaidAndClosed();
    const before = await expectedCashOf(pool, s.shop.tenantId, shiftOf(s.tillA));
    const result = await pushOne(app, s.tillA, handBack(qr.intentId, 10_000));
    expect(result.status).toBe("accepted");
    expect(await expectedCashOf(pool, s.shop.tenantId, shiftOf(s.tillA))).toBe(before - 10_000);
    expect(
      await rowsOf(
        pool,
        s.shop.tenantId,
        "SELECT refund_method, refund_amount::int AS amount, refunded_by_staff_id AS staff, " +
          "(SELECT reason FROM cash_move m WHERE m.payment_intent_id = i.id) AS reason " +
          "FROM payment_intent i WHERE id = $1",
        [qr.intentId],
      ),
    ).toEqual([
      {
        refund_method: "cash_from_drawer",
        amount: 10_000,
        staff: s.tillA.staffId,
        reason: "Trả lại tiền chuyển thừa",
      },
    ]);
    expect((await owed()).map((row) => row.id)).not.toContain(qr.intentId);
    const again = await pushOne(app, s.tillA, handBack(qr.intentId, 10_000));
    expect(again).toMatchObject({ status: "rejected", code: "SYNC_PAYMENT_INTENT_HANDED_BACK" });
  });

  it("refuses another amount than the excess, and money no sale closed with", async () => {
    const qr = await overpaidAndClosed();
    const wrong = await pushOne(app, s.tillA, handBack(qr.intentId, 9_000));
    expect(wrong).toMatchObject({
      status: "rejected",
      code: "SYNC_PAYMENT_EXCESS_AMOUNT_MISMATCH",
    });
    const open = await liveQrOf39k(app, s);
    await customerPays(open.contentCode, 49_000);
    const early = await pushOne(app, s.tillA, handBack(open.intentId, 10_000));
    expect(early).toMatchObject({
      status: "rejected",
      code: "SYNC_PAYMENT_NO_EXCESS_TO_HAND_BACK",
    });
    expect((await owed()).map((row) => row.id)).toEqual(
      expect.arrayContaining([qr.intentId, open.intentId]),
    );
  });

  it("past the cashier's cash limit takes a manager's approval of exactly that cash out", async () => {
    const cashierId = await hire(app, s.shop, CASHIER_PIN, s.shop.roleIds.cashier);
    const till = await freshTill(app, s, cashierId);
    const shiftId = await openedShift(app, till, 1_000_000);
    const managerId = await hireManager(app, s);
    const qr = await liveQrOf39k(app, s, till);
    // 561.000 đ over: more than the 500.000 đ a cashier moves through a drawer alone.
    await customerPays(qr.contentCode, 600_000);
    const paid = await pushOne(app, till, payByQr(till, qr.orderId, qr.intentId, 39_000));
    expect(paid.status).toBe("accepted");
    const sent = (approvalId?: string) =>
      command(till, "payment.hand_back_excess", {
        intentId: qr.intentId,
        cashMoveId: newId(),
        amount: 561_000,
        ...(approvalId === undefined ? {} : { approvalId }),
      });
    const cashOut = (amount: string) => ({ key: "cash_move", amount, subject: { shiftId } });

    expect((await pushOne(app, till, sent())).code).toBe("SYNC_APPROVAL_REQUIRED");
    const otherFigure = await approve(app, till, managerId, cashOut("500000"));
    expect((await pushOne(app, till, sent(otherFigure))).code).toBe(
      "SYNC_APPROVAL_FOR_ANOTHER_ACTION",
    );
    const exact = await approve(app, till, managerId, cashOut("561000"));
    expect((await pushOne(app, till, sent(exact))).status).toBe("accepted");
    expect(await expectedCashOf(pool, s.shop.tenantId, shiftId)).toBe(439_000);
    expect((await owed()).map((row) => row.id)).not.toContain(qr.intentId);
  });
});
