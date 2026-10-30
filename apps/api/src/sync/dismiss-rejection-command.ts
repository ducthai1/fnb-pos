import {
  DISMISSAL_APPROVAL_TYPES,
  DISMISSAL_NOTE_REQUIRED_TYPES,
  type DismissRejectionPayload,
  dismissRejectionPayloadSchema,
} from "@fnb/contracts";
import { appendAudit } from "@fnb/db";
import type pg from "pg";
import { assertReasonExplained } from "./reason-note";
import { requirePermission } from "./staff-permission-check";
import type { SyncCommandContext } from "./sync-command-context";
import { defineSyncCommand } from "./sync-command-definition";
import { CommandRejection, SYNC_ERROR_CODES } from "./sync-error-codes";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Holds the dismissal to the server's own record of the refused command, where it has one: a
 * till cannot name a harmless type, another till's command, or another order for a refused
 * payment, and so set it aside without the approval that payment needs. The order a QR
 * command was about is read through its intent, and stands in for one the till could not
 * name. Answers the order the dismissal is about. A command the server holds no record of (a
 * database restored from before it reached it) can only be taken at the till's word.
 */
async function orderOfTheRecordedRefusal(
  client: pg.PoolClient,
  deviceId: string,
  payload: DismissRejectionPayload,
): Promise<string | undefined> {
  const { rows } = await client.query<{
    device_id: string;
    type: string;
    status: string;
    order_id: string | null;
    intent_id: string | null;
  }>(
    "SELECT device_id, type, status, payload->>'orderId' AS order_id, " +
      "payload->>'intentId' AS intent_id FROM applied_command WHERE command_id = $1",
    [payload.rejectedCommandId],
  );
  const recorded = rows[0];
  if (recorded === undefined) return payload.orderId;
  if (
    recorded.device_id !== deviceId ||
    recorded.status !== "rejected" ||
    recorded.type !== payload.rejectedType
  ) {
    throw new CommandRejection(SYNC_ERROR_CODES.invalidPayload);
  }
  let orderId = recorded.order_id;
  if (orderId === null && recorded.intent_id !== null && UUID.test(recorded.intent_id)) {
    const intent = await client.query<{ order_id: string }>(
      "SELECT order_id FROM payment_intent WHERE id = $1",
      [recorded.intent_id],
    );
    orderId = intent.rows[0]?.order_id ?? null;
  }
  if (orderId === null) return payload.orderId;
  if (payload.orderId !== undefined && payload.orderId !== orderId) {
    throw new CommandRejection(SYNC_ERROR_CODES.invalidPayload);
  }
  return orderId;
}

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
  const orderId = await orderOfTheRecordedRefusal(client, device.deviceId, payload);
  if (DISMISSAL_NOTE_REQUIRED_TYPES.has(payload.rejectedType) && payload.reasonNote === undefined) {
    throw new CommandRejection(SYNC_ERROR_CODES.reasonNoteRequired);
  }
  const spent = DISMISSAL_APPROVAL_TYPES.has(payload.rejectedType)
    ? await requirePermission(
        context,
        {
          key: "close_unpaid_table",
          ...(orderId === undefined ? {} : { subject: { orderId } }),
        },
        payload.approvalId,
      )
    : null;
  await appendAudit(client, {
    actor: { kind: "staff", id: staffId },
    action: "sync.rejection_dismissed",
    entityKind: orderId === undefined ? "device" : "sales_order",
    entityId: orderId ?? device.deviceId,
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
