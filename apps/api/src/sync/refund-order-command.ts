import { type RefundOrderPayload, refundOrderPayloadSchema } from "@fnb/contracts";
import { newId } from "@fnb/db";
import {
  addVnd,
  buildRefund,
  compareVnd,
  computeOrderTotals,
  transitionOrder,
  vnd,
} from "@fnb/domain";
import { queueRefundInvoice } from "../einvoice/queue-einvoice";
import { orderOfBranch } from "./editable-order";
import { writeOrderLines } from "./order-line-writes";
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
 * amount to the đồng. Returns the refund's order id.
 */
async function refundOrder(context: SyncCommandContext, payload: RefundOrderPayload) {
  const { client, device, staffId, command } = context;
  const sale = await orderOfBranch(context, payload.saleOrderId);
  if ((await readStoredOrder(client, payload.refundOrderId, false)) !== null) {
    throw new CommandRejection(SYNC_ERROR_CODES.orderIdTaken);
  }
  await requirePermission(context, { key: "refund" }, payload.approvalId);
  const built = buildRefund(
    sale.order,
    payload.lines,
    await readRefundsOf(client, sale.order.id),
    { orderId: payload.refundOrderId, newLineId: newId },
    command.businessDate,
    sale.chargeProfile,
  );
  const refund = built.order;
  const amounts = refund.refundAmounts;
  if (amounts === null) throw new Error("buildRefund returned a refund without its amounts");
  const { amountDue } = computeOrderTotals(refund, sale.chargeProfile);
  const paidOut = addVnd(...payload.payouts.map((payout) => vnd(payout.amount)));
  if (compareVnd(paidOut, amountDue) !== 0) {
    throw new CommandRejection(SYNC_ERROR_CODES.paymentsDoNotMatchAmountDue);
  }
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
      "INSERT INTO payment (id, tenant_id, order_id, method, amount, received_by_staff_id, created_by) " +
        "VALUES ($1, $2, $3, $4, $5, $6, $6)",
      [newId(), device.tenantId, refund.id, payout.method, payout.amount, staffId],
    );
  }
  const paid = transitionOrder(refund, "paid");
  await client.query(
    "UPDATE sales_order SET status = $2, version = $3, paid_at = $4 WHERE id = $1",
    [refund.id, paid.status, paid.version, command.createdAt],
  );
  await queueRefundInvoice(context, sale.order.id, { order: paid, chargeProfile: sale.chargeProfile });
  return refund.id;
}

export const refundOrderCommand = defineSyncCommand(
  "order.refund",
  refundOrderPayloadSchema,
  refundOrder,
);
