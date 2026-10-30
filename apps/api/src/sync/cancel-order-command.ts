import { type CancelOrderPayload, cancelOrderPayloadSchema } from "@fnb/contracts";
import { appendAudit } from "@fnb/db";
import { reversedQuantityOf, transitionOrder } from "@fnb/domain";
import { assertNoPaidQrLeftOut, withdrawPendingIntents } from "../payments/qr-transfer-tenders";
import { orderOfBranch } from "./editable-order";
import { assertReasonExplained } from "./reason-note";
import { requirePermission } from "./staff-permission-check";
import type { SyncCommandContext } from "./sync-command-context";
import { defineSyncCommand } from "./sync-command-definition";
import { CommandRejection, SYNC_ERROR_CODES } from "./sync-error-codes";

/**
 * order.cancel: drops a draft nobody will pay for. While the kitchen has units nobody
 * voided, the order is refused: cancelling it would hide food that was made, which is what
 * a void (with its approver) is for. So is an order a QR of which the bank already paid:
 * the customer's money would go nowhere. Who cancelled and why goes to the audit trail; an
 * "other" reason comes with the staff member's note, kept on the order.
 *
 * Once guests were shown a bill (a pre-bill printed, even of an earlier version) or the
 * kitchen was sent part of the order (even if all of it was voided since), cancelling it
 * is closing a table nobody paid for: "print the pre-bill, take the cash, cancel" would
 * leave no sale behind. That needs close_unpaid_table, held or lent by a manager's
 * approval. A draft nobody was shown or served is cancelled as before.
 */
async function cancelOrder(context: SyncCommandContext, payload: CancelOrderPayload) {
  const { client, staffId } = context;
  assertReasonExplained(payload);
  const stored = await orderOfBranch(context, payload.orderId);
  const cancelled = transitionOrder(stored.order, "cancelled");
  const { lines } = stored.order;
  // A cancel line's own ticket is the kitchen being told to stop, not food it still has.
  const stillAtTheKitchen = lines.some((line) => {
    if (line.reversesLineId !== null) return false;
    const sent = stored.sentQuantityByLineId.get(line.id) ?? 0n;
    return sent > reversedQuantityOf(lines, line.id);
  });
  if (stillAtTheKitchen) throw new CommandRejection(SYNC_ERROR_CODES.orderHasSentItems);
  const kitchenHadIt = [...stored.sentQuantityByLineId.values()].some((sent) => sent > 0n);
  const shownABill = stored.preBillPrintedVersion !== null;
  const spent =
    kitchenHadIt || shownABill
      ? await requirePermission(
          context,
          { key: "close_unpaid_table", subject: { orderId: stored.order.id } },
          payload.approvalId,
        )
      : null;
  await assertNoPaidQrLeftOut(context, payload.orderId);
  await withdrawPendingIntents(context, payload.orderId);
  await client.query(
    "UPDATE sales_order SET status = $2, reason_code = $3, reason_note = $5, version = $4, " +
      "updated_at = now() WHERE id = $1",
    [
      payload.orderId,
      cancelled.status,
      payload.reasonCode,
      cancelled.version,
      payload.reasonNote ?? null,
    ],
  );
  await appendAudit(client, {
    actor: { kind: "staff", id: staffId },
    action: "order.cancelled",
    entityKind: "sales_order",
    entityId: payload.orderId,
    payload: {
      reasonCode: payload.reasonCode,
      ...(payload.reasonNote === undefined ? {} : { reasonNote: payload.reasonNote }),
      ...(spent === null
        ? {}
        : { approvalId: spent.approvalId, approvedByStaffId: spent.approvedByStaffId }),
    },
  });
  return payload.orderId;
}

export const cancelOrderCommand = defineSyncCommand(
  "order.cancel",
  cancelOrderPayloadSchema,
  cancelOrder,
);
