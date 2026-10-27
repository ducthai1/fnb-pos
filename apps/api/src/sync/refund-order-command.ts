import { type RefundOrderPayload, refundOrderPayloadSchema } from "@fnb/contracts";
import { newId } from "@fnb/db";
import {
  addVnd,
  buildRefund,
  compareVnd,
  computeOrderTotals,
  negateVnd,
  transitionOrder,
  vnd,
} from "@fnb/domain";
import { queueRefundInvoice } from "../einvoice/queue-einvoice";
import { orderOfBranch } from "./editable-order";
import { writeOrderLines } from "./order-line-writes";
import { paidTimesOf } from "./paid-times";
import { announceShiftCash, shiftForPayment } from "./payment-shift";
import { insertRefundAmounts } from "./refund-amounts-store";
import { insertRefundHeader } from "./refund-order-writes";
import { requirePermission } from "./staff-permission-check";
import { readRefundsOf, readStoredOrder } from "./stored-order";
import type { SyncCommandContext } from "./sync-command-context";
import { defineSyncCommand } from "./sync-command-definition";
import { CommandRejection, SYNC_ERROR_CODES } from "./sync-error-codes";

/**
 * order.refund: gives back units of a paid sale of this branch as a refund order of its
 * own, paid out at once. The domain's buildRefund works out what they give back from the
 * sale's own amounts (its charge profile, its discounts) after every earlier refund, so
 * refunding a sale bit by bit gives back exactly what it took. The till must pay out that
 * amount to the đồng, and an approval it needs is for this sale and that amount. Cash paid out leaves the drawer of the shift the till names (or its
 * own open shift), exactly as a sale's cash goes in, so the shift expects that much less.
 * Returns the refund's order id.
 */
/**
 * A refund goes back by bank transfer only when the customer paid the sale by a QR transfer:
 * a cash sale handed back "by transfer" would let money leave the shop to an account nobody
 * paid from, with nothing to check it against.
 */
async function assertRefundGoesBackTheWayItCame(
  context: SyncCommandContext,
  saleId: string,
  payouts: RefundOrderPayload["payouts"],
) {
  if (!payouts.some((payout) => payout.method === "bank_transfer")) return;
  const { rows } = await context.client.query<{ by_qr: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM payment WHERE order_id = $1 AND method = 'qr_transfer') AS by_qr",
    [saleId],
  );
  if (rows[0]?.by_qr !== true) throw new CommandRejection(SYNC_ERROR_CODES.refundMethodNotAllowed);
}

async function refundOrder(context: SyncCommandContext, payload: RefundOrderPayload) {
  const { client, device, staffId, time } = context;
  const sale = await orderOfBranch(context, payload.saleOrderId);
  await assertRefundGoesBackTheWayItCame(context, sale.order.id, payload.payouts);
  if ((await readStoredOrder(client, payload.refundOrderId, false)) !== null) {
    throw new CommandRejection(SYNC_ERROR_CODES.orderIdTaken);
  }
  const built = buildRefund(
    sale.order,
    payload.lines,
    await readRefundsOf(client, sale.order.id),
    { orderId: payload.refundOrderId, newLineId: newId },
    time.businessDate,
    sale.chargeProfile,
  );
  const refund = built.order;
  const amounts = refund.refundAmounts;
  if (amounts === null) throw new Error("buildRefund returned a refund without its amounts");
  const { amountDue } = computeOrderTotals(refund, sale.chargeProfile);
  // A manager approves this refund of this sale for the money it hands back (the refund's
  // amount due is negative, as its payouts are recorded), as built here.
  const action = { refundAmount: negateVnd(amountDue), subject: { orderId: sale.order.id } };
  await requirePermission(context, { key: "refund", ...action }, payload.approvalId);
  const paidOut = addVnd(...payload.payouts.map((payout) => vnd(payout.amount)));
  if (compareVnd(paidOut, amountDue) !== 0) {
    throw new CommandRejection(SYNC_ERROR_CODES.paymentsDoNotMatchAmountDue);
  }
  const shift = await shiftForPayment(context, payload.shiftId);
  if (!(await insertRefundHeader(client, context, sale, { refund, amounts }, payload))) {
    throw new CommandRejection(SYNC_ERROR_CODES.deviceOrderNoTaken);
  }
  const write = { tenantId: device.tenantId, orderId: refund.id, staffId };
  await writeOrderLines(
    client,
    { ...write, restockByLineId: built.restockByLineId },
    [],
    refund.lines,
  );
  await insertRefundAmounts(client, device.tenantId, refund.id, amounts, staffId);
  // Payouts go in while the refund is still a draft: a closed order refuses new rows.
  for (const payout of payload.payouts) {
    await client.query(
      "INSERT INTO payment (id, tenant_id, order_id, method, amount, received_by_staff_id, " +
        "created_by, shift_id, recorded_after_shift_close) VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8)",
      [
        newId(),
        device.tenantId,
        refund.id,
        payout.method,
        payout.amount,
        staffId,
        shift.shiftId,
        shift.afterClose,
      ],
    );
  }
  const paid = transitionOrder(refund, "paid");
  await client.query(
    "UPDATE sales_order SET status = $2, version = $3, shift_id = $4, paid_at = $5, " +
      "paid_at_device = $6, paid_received_at = $7 WHERE id = $1",
    [refund.id, paid.status, paid.version, shift.shiftId, ...paidTimesOf(time)],
  );
  await queueRefundInvoice(context, sale.order.id, {
    order: paid,
    chargeProfile: sale.chargeProfile,
  });
  await announceShiftCash(
    context,
    shift,
    payload.payouts.map((tender) => tender.method),
  );
  return refund.id;
}

export const refundOrderCommand = defineSyncCommand(
  "order.refund",
  refundOrderPayloadSchema,
  refundOrder,
);
