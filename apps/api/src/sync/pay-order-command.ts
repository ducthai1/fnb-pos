import { type PayOrderPayload, payOrderPayloadSchema } from "@fnb/contracts";
import { newId } from "@fnb/db";
import { addVnd, compareVnd, computeOrderTotals, transitionOrder, vnd } from "@fnb/domain";
import { queueSaleInvoice } from "../einvoice/queue-einvoice";
import {
  assertNoPaidQrLeftOut,
  assertQrTransfersArePaid,
  withdrawPendingIntents,
} from "../payments/qr-transfer-tenders";
import { paidTimesOf } from "./paid-times";
import { announceShiftCash, shiftForPayment } from "./payment-shift";
import { SHIFT_SYNC_ERROR_CODES } from "./shift-sync-error-codes";
import { readStoredOrder } from "./stored-order";
import type { SyncCommandContext } from "./sync-command-context";
import { defineSyncCommand } from "./sync-command-definition";
import { CommandRejection, SYNC_ERROR_CODES } from "./sync-error-codes";

/**
 * order.pay: closes the draft with the payments the till took. The total is the server's,
 * computed with the charge profile stored on the order. When it differs from what the
 * customer was asked for (another till added a line after the bill was printed), the
 * payment is refused: that is a real conflict a person has to settle. Returns the order id.
 */
async function payOrder(context: SyncCommandContext, payload: PayOrderPayload) {
  const { client, device, staffId, time } = context;
  const stored = await readStoredOrder(client, payload.orderId, true);
  if (stored === null || stored.branchId !== device.branchId) {
    throw new CommandRejection(SYNC_ERROR_CODES.orderNotFound);
  }
  const paid = transitionOrder(stored.order, "paid");
  const { amountDue } = computeOrderTotals(stored.order, stored.chargeProfile);
  if (compareVnd(amountDue, vnd(payload.expectedAmountDue)) !== 0) {
    throw new CommandRejection(SYNC_ERROR_CODES.orderTotalMismatch);
  }
  const tendered = addVnd(...payload.payments.map((payment) => vnd(payment.amount)));
  if (compareVnd(tendered, amountDue) !== 0) {
    throw new CommandRejection(SYNC_ERROR_CODES.paymentsDoNotMatchAmountDue);
  }
  await assertQrTransfersArePaid(context, payload.orderId, payload.payments);
  const usedIntents = payload.payments.flatMap((p) => p.paymentIntentId ?? []);
  await assertNoPaidQrLeftOut(context, payload.orderId, usedIntents);
  const shift = await shiftForPayment(context, payload.shiftId);
  // A sale belongs to a shift: its cash to that drawer, its takings to that shift's report.
  // Taken with none, the money would sit in no drawer and no report.
  if (shift.shiftId === null) throw new CommandRejection(SHIFT_SYNC_ERROR_CODES.paymentNeedsShift);
  // Payments go in while the order is still a draft: a closed order refuses new rows.
  for (const payment of payload.payments) {
    await client.query(
      "INSERT INTO payment (id, tenant_id, order_id, method, amount, received_by_staff_id, " +
        "created_by, shift_id, recorded_after_shift_close, payment_intent_id) " +
        "VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9)",
      [
        newId(),
        device.tenantId,
        payload.orderId,
        payment.method,
        payment.amount,
        staffId,
        shift.shiftId,
        shift.afterClose,
        payment.paymentIntentId ?? null,
      ],
    );
  }
  await client.query(
    "UPDATE sales_order SET status = $2, version = $3, shift_id = $4, paid_at = $5, " +
      "paid_at_device = $6, paid_received_at = $7, updated_at = now() WHERE id = $1",
    [payload.orderId, paid.status, paid.version, shift.shiftId, ...paidTimesOf(time)],
  );
  await queueSaleInvoice(context, stored);
  await withdrawPendingIntents(context, payload.orderId);
  await announceShiftCash(
    context,
    shift,
    payload.payments.map((tender) => tender.method),
  );
  return payload.orderId;
}

export const payOrderCommand = defineSyncCommand("order.pay", payOrderPayloadSchema, payOrder);
