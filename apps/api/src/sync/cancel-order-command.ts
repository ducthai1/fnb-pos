import { type CancelOrderPayload, cancelOrderPayloadSchema } from "@fnb/contracts";
import { appendAudit } from "@fnb/db";
import { reversedQuantityOf, transitionOrder } from "@fnb/domain";
import { orderOfBranch } from "./editable-order";
import type { SyncCommandContext } from "./sync-command-context";
import { defineSyncCommand } from "./sync-command-definition";
import { CommandRejection, SYNC_ERROR_CODES } from "./sync-error-codes";

/**
 * order.cancel: drops a draft nobody will pay for. While the kitchen has units nobody
 * voided, the order is refused: cancelling it would hide food that was made, which is what
 * a void (with its approver) is for. Who cancelled and why goes to the audit trail.
 */
async function cancelOrder(context: SyncCommandContext, payload: CancelOrderPayload) {
  const { client, staffId } = context;
  const stored = await orderOfBranch(context, payload.orderId);
  const cancelled = transitionOrder(stored.order, "cancelled");
  const { lines } = stored.order;
  const stillAtTheKitchen = lines.some((line) => {
    const sent = stored.sentQuantityByLineId.get(line.id) ?? 0n;
    return sent > reversedQuantityOf(lines, line.id);
  });
  if (stillAtTheKitchen) throw new CommandRejection(SYNC_ERROR_CODES.orderHasSentItems);
  await client.query(
    "UPDATE sales_order SET status = $2, reason_code = $3, version = $4, updated_at = now() " +
      "WHERE id = $1",
    [payload.orderId, cancelled.status, payload.reasonCode, cancelled.version],
  );
  await appendAudit(client, {
    actor: { kind: "staff", id: staffId },
    action: "order.cancelled",
    entityKind: "sales_order",
    entityId: payload.orderId,
    payload: { reasonCode: payload.reasonCode },
  });
  return payload.orderId;
}

export const cancelOrderCommand = defineSyncCommand(
  "order.cancel",
  cancelOrderPayloadSchema,
  cancelOrder,
);
