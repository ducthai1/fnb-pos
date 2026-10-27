import {
  type HandBackQrExcessPayload,
  QR_EXCESS_HANDED_BACK_REASON,
  handBackQrExcessPayloadSchema,
} from "@fnb/contracts";
import { appendAudit } from "@fnb/db";
import { businessDate, compareVnd, vnd } from "@fnb/domain";
import { qrExcess } from "@fnb/domain/payment";
import { assertAcceptsCashMoves, cashMoveAction } from "@fnb/domain/shift";
import { SHIFT_SYNC_ERROR_CODES } from "../sync/shift-sync-error-codes";
import { readShiftCashBook, readUnclosedShiftOfDevice } from "../sync/stored-shift";
import { requirePermission } from "../sync/staff-permission-check";
import type { SyncCommandContext } from "../sync/sync-command-context";
import { defineSyncCommand } from "../sync/sync-command-definition";
import { CommandRejection } from "../sync/sync-error-codes";
import { PAYMENT_SYNC_ERROR_CODES as CODES } from "./payment-error-codes";
import { readPaymentIntent } from "./payment-intent-store";

/**
 * payment.hand_back_excess: the customer transferred more than the order, the order was
 * closed with the QR at its own amount, and the cashier hands the excess back in cash from
 * the drawer. One command does both halves, so neither can be left without the other: the
 * QR is marked handed back for exactly the excess the bank confirmed, and the shift's drawer
 * pays that out as a cash move linked to the QR (judged by the cash_move limit on all the
 * shift moved, as any cash taken out is). Returns the shift id: its cash book changed.
 */
async function handBackQrExcess(context: SyncCommandContext, payload: HandBackQrExcessPayload) {
  const { client, device, staffId, branch } = context;
  const intent = await readPaymentIntent(client, payload.intentId, true);
  if (intent === null || intent.branchId !== device.branchId) {
    throw new CommandRejection(CODES.intentNotFound);
  }
  const { rows } = await client.query<{ used: boolean; handed_back: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM payment p WHERE p.payment_intent_id = i.id) AS used, " +
      "i.refunded_at IS NOT NULL AS handed_back FROM payment_intent i WHERE i.id = $1",
    [intent.id],
  );
  const state = rows[0];
  if (state?.handed_back === true) throw new CommandRejection(CODES.intentHandedBack);
  if (intent.status !== "overpaid" || intent.receivedAmount === null || state?.used !== true) {
    throw new CommandRejection(CODES.noExcessToHandBack);
  }
  const excess = qrExcess(intent.amount, intent.receivedAmount);
  if (compareVnd(excess, vnd(payload.amount)) !== 0) {
    throw new CommandRejection(CODES.excessAmountMismatch);
  }
  const shift = await readUnclosedShiftOfDevice(client, device.deviceId, true);
  if (shift === null) throw new CommandRejection(SHIFT_SYNC_ERROR_CODES.noOpenShift);
  assertAcceptsCashMoves(shift.status);
  const { ledger } = await readShiftCashBook(client, shift);
  const spent = await requirePermission(
    context,
    {
      ...cashMoveAction(ledger, { kind: "cash_out", amount: excess, staffId }),
      subject: { shiftId: shift.id },
    },
    payload.approvalId,
  );
  const inserted = await client.query(
    "INSERT INTO cash_move (id, tenant_id, shift_id, kind, amount, reason, staff_id, " +
      "approval_id, created_by, payment_intent_id) " +
      "VALUES ($1, $2, $3, 'out', $4, $5, $6, $7, $6, $8) ON CONFLICT (id) DO NOTHING",
    [
      payload.cashMoveId,
      device.tenantId,
      shift.id,
      excess,
      QR_EXCESS_HANDED_BACK_REASON,
      staffId,
      spent?.approvalId ?? null,
      intent.id,
    ],
  );
  if (inserted.rowCount !== 1) throw new CommandRejection(SHIFT_SYNC_ERROR_CODES.cashMoveIdTaken);
  const day = businessDate(context.receivedAt.getTime(), {
    utcOffsetMinutes: branch.utcOffsetMinutes,
    dayStartMinute: branch.businessDayStartMinute,
  });
  await client.query(
    "UPDATE payment_intent SET refunded_at = $2, refunded_by_staff_id = $3, " +
      "refund_method = 'cash_from_drawer', refund_note = $4, refund_business_date = $5, " +
      "refund_amount = $6, updated_at = $2 WHERE id = $1 AND refunded_at IS NULL",
    [intent.id, context.receivedAt, staffId, QR_EXCESS_HANDED_BACK_REASON, day, excess],
  );
  await appendAudit(client, {
    actor: { kind: "staff", id: staffId },
    action: "payment.qr_money_handed_back",
    entityKind: "payment_intent",
    entityId: intent.id,
    payload: {
      orderId: intent.orderId,
      intentStatus: intent.status,
      amount: excess,
      method: "cash_from_drawer",
      shiftId: shift.id,
      cashMoveId: payload.cashMoveId,
      businessDate: day,
    },
  });
  return shift.id;
}

export const handBackQrExcessCommand = defineSyncCommand(
  "payment.hand_back_excess",
  handBackQrExcessPayloadSchema,
  handBackQrExcess,
  "shift",
);
