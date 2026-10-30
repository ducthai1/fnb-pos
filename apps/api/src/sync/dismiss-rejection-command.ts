import {
  DISMISSAL_APPROVAL_TYPES,
  DISMISSAL_NOTE_REQUIRED_TYPES,
  type DismissRejectionPayload,
  dismissRejectionPayloadSchema,
} from "@fnb/contracts";
import { appendAudit } from "@fnb/db";
import { assertReasonExplained } from "./reason-note";
import { requirePermission } from "./staff-permission-check";
import type { SyncCommandContext } from "./sync-command-context";
import { defineSyncCommand } from "./sync-command-definition";
import { CommandRejection, SYNC_ERROR_CODES } from "./sync-error-codes";

/**
 * sync.rejection_dismissed: a staff member set aside a command the server refused for good
 * and said why. Nothing of the refused command is applied; the audit trail keeps who gave it
 * up, what it was and the reason, so a payment or a kitchen ticket that was refused cannot
 * vanish from the till without a name beside it. Setting aside a command that moves money
 * or tells the kitchen to make food needs the staff member's words, whatever the reason key.
 * One about an order (a payment, a refund, a kitchen ticket, a QR) also gives up that money
 * or food, so, like closing an unpaid table, it is the staff member's alone only with
 * close_unpaid_table and otherwise needs a manager's approval of exactly that order. One
 * that names no order has nothing to bind an approval to, so only a staff member who holds
 * close_unpaid_table can set it aside.
 */
async function dismissRejection(context: SyncCommandContext, payload: DismissRejectionPayload) {
  const { client, staffId, device } = context;
  assertReasonExplained(payload);
  if (DISMISSAL_NOTE_REQUIRED_TYPES.has(payload.rejectedType) && payload.reasonNote === undefined) {
    throw new CommandRejection(SYNC_ERROR_CODES.reasonNoteRequired);
  }
  const spent = DISMISSAL_APPROVAL_TYPES.has(payload.rejectedType)
    ? await requirePermission(
        context,
        {
          key: "close_unpaid_table",
          ...(payload.orderId === undefined ? {} : { subject: { orderId: payload.orderId } }),
        },
        payload.approvalId,
      )
    : null;
  await appendAudit(client, {
    actor: { kind: "staff", id: staffId },
    action: "sync.rejection_dismissed",
    entityKind: payload.orderId === undefined ? "device" : "sales_order",
    entityId: payload.orderId ?? device.deviceId,
    payload: {
      rejectedCommandId: payload.rejectedCommandId,
      rejectedType: payload.rejectedType,
      rejectedCode: payload.rejectedCode,
      reasonCode: payload.reasonCode,
      ...(payload.reasonNote === undefined ? {} : { reasonNote: payload.reasonNote }),
      ...(spent === null
        ? {}
        : { approvalId: spent.approvalId, approvedByStaffId: spent.approvedByStaffId }),
    },
  });
  return payload.rejectedCommandId;
}

export const dismissRejectionCommand = defineSyncCommand(
  "sync.rejection_dismissed",
  dismissRejectionPayloadSchema,
  dismissRejection,
  "dismissal",
);
