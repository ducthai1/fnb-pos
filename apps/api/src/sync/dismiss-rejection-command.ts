import {
  DISMISSAL_APPROVAL_TYPES,
  DISMISSAL_NOTE_REQUIRED_TYPES,
  DISMISSAL_SHIFT_APPROVAL_TYPES,
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
 * The shift a dismissed shift command is bound to: the one the till names, which must be a
 * shift of this very till (a till cannot borrow an approval given for another till's drawer);
 * none named, none bound, and then only a holder of the key may set it aside.
 */
async function shiftOfTheDismissal(
  client: pg.PoolClient,
  deviceId: string,
  payload: DismissRejectionPayload,
): Promise<string | undefined> {
  if (payload.shiftId === undefined || !DISMISSAL_SHIFT_APPROVAL_TYPES.has(payload.rejectedType)) {
    return undefined;
  }
  const { rows } = await client.query<{ device_id: string }>(
    "SELECT device_id FROM shift WHERE id = $1",
    [payload.shiftId],
  );
  if (rows[0]?.device_id !== deviceId) throw new CommandRejection(SYNC_ERROR_CODES.invalidPayload);
  return payload.shiftId;
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
 * close_unpaid_table can set it aside. A refused cash move or shift close is cash in or out
 * of the drawer with nothing on the books: it needs open_drawer, or a manager's approval of
 * that shift.
 */
async function dismissRejection(context: SyncCommandContext, payload: DismissRejectionPayload) {
  const { client, staffId, device } = context;
  assertReasonExplained(payload);
  const orderId = await orderOfTheRecordedRefusal(client, device.deviceId, payload);
  if (DISMISSAL_NOTE_REQUIRED_TYPES.has(payload.rejectedType) && payload.reasonNote === undefined) {
    throw new CommandRejection(SYNC_ERROR_CODES.reasonNoteRequired);
  }
  const shiftId = await shiftOfTheDismissal(client, device.deviceId, payload);
  const spent = DISMISSAL_APPROVAL_TYPES.has(payload.rejectedType)
    ? await requirePermission(
        context,
        {
          key: "close_unpaid_table",
          ...(orderId === undefined ? {} : { subject: { orderId } }),
        },
        payload.approvalId,
      )
    : DISMISSAL_SHIFT_APPROVAL_TYPES.has(payload.rejectedType)
      ? await requirePermission(
          context,
          { key: "open_drawer", ...(shiftId === undefined ? {} : { subject: { shiftId } }) },
          payload.approvalId,
        )
      : null;
  const entity =
    orderId !== undefined
      ? { entityKind: "sales_order", entityId: orderId }
      : shiftId !== undefined
        ? { entityKind: "shift", entityId: shiftId }
        : { entityKind: "device", entityId: device.deviceId };
  await appendAudit(client, {
    actor: { kind: "staff", id: staffId },
    action: "sync.rejection_dismissed",
    ...entity,
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
