import {
  QR_MONEY_HANDED_BACK_REASON,
  type QrRefund,
  type QrRefundMethod,
  moneyToWire,
} from "@fnb/contracts";
import { appendAudit, newId } from "@fnb/db";
import { appendChange } from "../sync/change-feed";
import { shiftSnapshotOf } from "../sync/shift-snapshot";
import { readShift } from "../sync/stored-shift";
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
  /** The open shift whose drawer the cash came out of, for cash_from_drawer. */
  readonly fromShiftId?: string | undefined;
  /** The API's clock: the business day the money went back on is the branch's at this time. */
  readonly now: Date;
}

export type HandBackOutcome =
  | { readonly ok: true; readonly refund: QrRefund }
  | { readonly ok: false; readonly status: 404 | 409; readonly code: string };

interface IntentRow extends PaymentIntentRow {
  tenant_id: string;
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
      `payment_intent.tenant_id, payment_intent.refunded_at, ${USED_BY_SALE}, ` +
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
  const drawer = await openDrawerOf(client, request, row.branch_id);
  if (!drawer.ok) return drawer;
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
  if (drawer.shiftId !== null) {
    await payOutOfTheDrawer(client, {
      tenantId: row.tenant_id,
      shiftId: drawer.shiftId,
      intentId: request.intentId,
      appUserId: request.appUserId,
      amount,
    });
  }
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
      ...(drawer.shiftId === null ? {} : { shiftId: drawer.shiftId }),
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

type DrawerOutcome =
  | { readonly ok: true; readonly shiftId: string | null }
  | { readonly ok: false; readonly status: 404 | 409; readonly code: string };

/**
 * The open shift of the QR's branch whose drawer the cash comes out of, locked so it cannot
 * close meanwhile; none for cash from outside a drawer or a transfer back.
 */
async function openDrawerOf(
  client: pg.ClientBase,
  request: HandBackRequest,
  branchId: string,
): Promise<DrawerOutcome> {
  if (request.method !== "cash_from_drawer") return { ok: true, shiftId: null };
  const { rows } = await client.query<{ branch_id: string; status: string }>(
    "SELECT branch_id, status FROM shift WHERE id = $1 FOR UPDATE",
    [request.fromShiftId],
  );
  const shift = rows[0];
  if (shift === undefined || shift.branch_id !== branchId) {
    return { ok: false, status: 404, code: CODES.shiftNotFound };
  }
  if (shift.status !== "open") return { ok: false, status: 409, code: CODES.shiftNotOpen };
  return { ok: true, shiftId: request.fromShiftId ?? null };
}

/**
 * The cash leaves the shift's drawer as a cash move linked to the QR, in the same
 * transaction as the marking, so the shift expects exactly that much less; its tills hear
 * of the new figures through the change feed.
 */
async function payOutOfTheDrawer(
  client: pg.ClientBase,
  move: { tenantId: string; shiftId: string; intentId: string; appUserId: string; amount: bigint },
) {
  await client.query(
    "INSERT INTO cash_move (id, tenant_id, shift_id, kind, amount, reason, app_user_id, " +
      "created_by, payment_intent_id) VALUES ($1, $2, $3, 'out', $4, $5, $6, $6, $7)",
    [
      newId(),
      move.tenantId,
      move.shiftId,
      move.amount,
      QR_MONEY_HANDED_BACK_REASON,
      move.appUserId,
      move.intentId,
    ],
  );
  const shift = await readShift(client, move.shiftId, false);
  if (shift === null) return;
  await appendChange(client, move.tenantId, {
    branchId: shift.branchId,
    entity: "shift",
    entityId: shift.id,
    snapshot: await shiftSnapshotOf(client, shift),
    commandId: null,
  });
}
