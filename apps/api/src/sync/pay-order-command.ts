import { type PayOrderPayload, payOrderPayloadSchema } from "@fnb/contracts";
import { newId } from "@fnb/db";
import { addVnd, compareVnd, computeOrderTotals, transitionOrder, vnd } from "@fnb/domain";
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
  const { client, device, staffId } = context;
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
  // Payments go in while the order is still a draft: a closed order refuses new rows.
  for (const payment of payload.payments) {
    await client.query(
      "INSERT INTO payment (id, tenant_id, order_id, method, amount, received_by_staff_id, created_by) " +
        "VALUES ($1, $2, $3, $4, $5, $6, $6)",
      [newId(), device.tenantId, payload.orderId, payment.method, payment.amount, staffId],
    );
  }
  await client.query(
    "UPDATE sales_order SET status = $2, version = $3, updated_at = now() WHERE id = $1",
    [payload.orderId, paid.status, paid.version],
  );
  return payload.orderId;
}

export const payOrderCommand = defineSyncCommand("order.pay", payOrderPayloadSchema, payOrder);
