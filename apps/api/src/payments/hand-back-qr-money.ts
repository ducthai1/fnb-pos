import { type QrRefund, type QrRefundMethod, moneyToWire } from "@fnb/contracts";
import { appendAudit } from "@fnb/db";
import { businessDate } from "@fnb/domain";
import type pg from "pg";
import { PAYMENT_ROUTE_ERROR_CODES as CODES } from "./payment-error-codes";
import { INTENT_COLUMNS, type PaymentIntentRow, intentOfRow } from "./payment-intent-store";
import { NO_SALE_COUNTS_IT, USED_BY_SALE, owedOf } from "./unmatched-payments-query";

export interface HandBackRequest {
  readonly appUserId: string;
  readonly intentId: string;
  readonly method: QrRefundMethod;
  readonly note: string;
  /** The API's clock: the business day the money went back on is the branch's at this time. */
  readonly now: Date;
}

export type HandBackOutcome =
  | { readonly ok: true; readonly refund: QrRefund }
  | { readonly ok: false; readonly status: 404 | 409; readonly code: string };

interface IntentRow extends PaymentIntentRow {
  used_by_sale: boolean;
  refunded_at: Date | null;
  owed: boolean;
  utc_offset_minutes: number;
  business_day_start_minute: number;
}

/**
 * A person marks the money the bank brought for a QR as handed back to the customer. Only
 * money no sale counts can go back, all of it (nothing of it paid anything), and once: the
 * intent row is locked, so a second marking waits for the first and is then refused. Who
 * did it, when, how much and how goes on the audit trail; the business day it happened on
 * puts it on that day's report, beside the sales, or, when that day was already closed,
 * beside its close (marked by the database), leaving the closed figures as they were.
 */
export async function handBackQrMoney(
  client: pg.ClientBase,
  request: HandBackRequest,
): Promise<HandBackOutcome> {
  const { rows } = await client.query<IntentRow>(
    `SELECT ${INTENT_COLUMNS.split(", ")
      .map((column) => `payment_intent.${column}`)
      .join(", ")}, ` +
      `payment_intent.refunded_at, ${USED_BY_SALE}, ` +
      `${NO_SALE_COUNTS_IT} AS owed, b.utc_offset_minutes, b.business_day_start_minute ` +
      "FROM payment_intent JOIN branch b ON b.tenant_id = payment_intent.tenant_id " +
      "AND b.id = payment_intent.branch_id WHERE payment_intent.id = $1 " +
      "FOR UPDATE OF payment_intent",
    [request.intentId],
  );
  const row = rows[0];
  if (row === undefined) return { ok: false, status: 404, code: CODES.intentNotFound };
  if (row.refunded_at !== null) return { ok: false, status: 409, code: CODES.alreadyHandedBack };
  if (!row.owed || row.received_amount === null) {
    return { ok: false, status: 409, code: CODES.notOwedToCustomer };
  }
  const day = businessDate(request.now.getTime(), {
    utcOffsetMinutes: row.utc_offset_minutes,
    dayStartMinute: row.business_day_start_minute,
  });
  const amount = owedOf(intentOfRow(row), row.used_by_sale);
  const marked = await client.query<{ after_close: boolean }>(
    "UPDATE payment_intent SET refunded_at = $2, refunded_by_app_user_id = $3, " +
      "refund_method = $4, refund_note = $5, refund_business_date = $6, refund_amount = $7, " +
      "updated_at = $2 WHERE id = $1 AND refunded_at IS NULL " +
      "RETURNING refunded_after_day_close AS after_close",
    [request.intentId, request.now, request.appUserId, request.method, request.note, day, amount],
  );
  const afterDayClose = marked.rows[0]?.after_close;
  if (afterDayClose === undefined) return { ok: false, status: 409, code: CODES.alreadyHandedBack };
  await appendAudit(client, {
    actor: { kind: "app_user", id: request.appUserId },
    action: "payment.qr_money_handed_back",
    entityKind: "payment_intent",
    entityId: request.intentId,
    payload: {
      orderId: row.order_id,
      intentStatus: row.status,
      amount,
      method: request.method,
      note: request.note,
      businessDate: day,
      afterDayClose,
    },
  });
  return {
    ok: true,
    refund: {
      intentId: request.intentId,
      branchId: row.branch_id,
      amount: moneyToWire(amount),
      method: request.method,
      note: request.note,
      businessDate: day,
      refundedAt: request.now.toISOString(),
      refundedByAppUserId: request.appUserId,
      afterDayClose,
    },
  };
}
