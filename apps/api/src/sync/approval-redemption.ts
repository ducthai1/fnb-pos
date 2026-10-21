import { newId } from "@fnb/db";
import {
  type ApprovalSubject,
  type BasisPoints,
  type PermissionAction,
  type Vnd,
  isPermissionKey,
  judgeApproval,
  quantity,
  vnd,
} from "@fnb/domain";
import type { SyncCommandContext } from "./sync-command-context";
import { CommandRejection, SYNC_ERROR_CODES } from "./sync-error-codes";

/**
 * How long after an approval the command relying on it may be recorded. A manager approves
 * at the till a moment before the cashier acts, so ten minutes is plenty for a slow
 * customer and short enough that an approval cannot be kept for a later order. It is
 * measured to when the till recorded the command, not when it synced, so a till that went
 * offline right after still has its approval honoured.
 */
export const APPROVAL_VALID_FOR_MS = 10 * 60_000;

/**
 * How far behind the server's a till's clock may run: a command it recorded just after the
 * approval may carry a time a little before it. More than that is a command recorded
 * before anyone approved it, or a clock that needs setting.
 */
export const APPROVAL_TILL_CLOCK_SLACK_MS = 2 * 60_000;

/**
 * How long after an approval the server still takes a command relying on it, by the
 * server's clock alone. The till was online when it was given (asking goes through the
 * server), so this only has to cover a connection lost right after: a router restart or an
 * outage over a rush, or a till left offline until the evening. Without it the till's own
 * date would be the only check, and a till whose clock was turned back (or a hand-edited
 * command) could keep an approval for days; with it, for at most twelve hours. That is safe
 * because an approval is bound to its order (and line) or shift and to its figures: kept
 * longer, it still covers only the one thing the manager was shown.
 */
export const APPROVAL_SYNC_DELAY_MS = 12 * 60 * 60_000;

interface ApprovalRow {
  action_key: string;
  requested_by_staff_id: string;
  approved_by_staff_id: string;
  device_id: string;
  payload: Record<string, unknown>;
  /** When it was given, by the API's clock, which also times the command relying on it. */
  created_at: Date;
}

/**
 * The approval a command names, in its payload or on its envelope. Two different ones is
 * a till bug, and picking either would apply an approval nobody chose for this.
 */
export function approvalIdOf(
  context: SyncCommandContext,
  inPayload: string | undefined,
): string | undefined {
  const onEnvelope = context.command.approvalId;
  if (inPayload !== undefined && onEnvelope !== undefined && inPayload !== onEnvelope) {
    throw new CommandRejection(SYNC_ERROR_CODES.invalidPayload);
  }
  return inPayload ?? onEnvelope;
}

/**
 * Uses on-the-spot approval `approvalId` for `action` and answers who approved it. It must
 * have been asked by this staff member on this till, for this action on this very order
 * (and line) or shift, with these very figures (the domain's judgeApproval: an approval for
 * 600.000 đ covers neither 500.000 đ nor 800.000 đ, one for a refund of order 12 no refund
 * of another), in time (see `timely`), and not be used yet by any command of any kind. The
 * approver's role is not read again: it was checked, under lock, when the approval was
 * given, minutes before. The use is recorded in the command's transaction, so a command
 * refused later gives the approval back.
 */
export async function redeemApproval(
  context: SyncCommandContext,
  approvalId: string,
  action: PermissionAction,
): Promise<string> {
  const { client, device, staffId, command } = context;
  const { rows } = await client.query<ApprovalRow>(
    "SELECT action_key, requested_by_staff_id, approved_by_staff_id, device_id, payload, " +
      "created_at FROM approval_log WHERE id = $1",
    [approvalId],
  );
  const approval = rows[0];
  if (approval === undefined) throw new CommandRejection(SYNC_ERROR_CODES.approvalNotFound);
  if (approval.requested_by_staff_id !== staffId || approval.device_id !== device.deviceId) {
    throw new CommandRejection(SYNC_ERROR_CODES.approvalNotForThisStaff);
  }
  const approved = approvedAction(approval);
  const judgement = approved === null ? "another_action" : judgeApproval(approved, action);
  if (judgement === "another_subject") {
    throw new CommandRejection(SYNC_ERROR_CODES.approvalForAnotherSubject);
  }
  if (judgement !== "covers") {
    throw new CommandRejection(SYNC_ERROR_CODES.approvalForAnotherAction);
  }
  if (!timely(approval, context.time.effectiveAt.getTime(), context.receivedAt.getTime())) {
    throw new CommandRejection(SYNC_ERROR_CODES.approvalExpired);
  }
  const used = await client.query(
    "INSERT INTO approval_use (id, tenant_id, approval_id, command_id, payload) " +
      "VALUES ($1, $2, $3, $4, $5) ON CONFLICT ON CONSTRAINT approval_use_once DO NOTHING",
    [
      newId(),
      device.tenantId,
      approvalId,
      command.commandId,
      JSON.stringify({ commandType: command.type, actionKey: action.key }),
    ],
  );
  if (used.rowCount !== 1) throw new CommandRejection(SYNC_ERROR_CODES.approvalAlreadyUsed);
  return approval.approved_by_staff_id;
}

/**
 * Whether a command the till recorded at `recordedAt` may rely on the approval: recorded
 * within APPROVAL_VALID_FOR_MS after it was given (allowing for a till clock a little
 * slow), and reaching the server within APPROVAL_SYNC_DELAY_MS of it.
 */
function timely(approval: ApprovalRow, recordedAt: number, receivedAt: number): boolean {
  const givenAt = approval.created_at.getTime();
  return (
    recordedAt >= givenAt - APPROVAL_TILL_CLOCK_SLACK_MS &&
    recordedAt <= givenAt + APPROVAL_VALID_FOR_MS &&
    receivedAt - givenAt <= APPROVAL_SYNC_DELAY_MS
  );
}

/**
 * The action an approval was given for, as the approval route stored it: the rate as a
 * number, money as decimal strings, the voided units as a decimal quantity, the subject as
 * ids; those the action does not carry are left out. Null for a row nobody could have
 * written that way, which then covers nothing.
 */
function approvedAction(approval: ApprovalRow): PermissionAction | null {
  const { payload } = approval;
  if (!isPermissionKey(approval.action_key)) return null;
  const { discountRate, voidedQuantity, subject } = payload;
  if (discountRate !== undefined && typeof discountRate !== "number") return null;
  if (voidedQuantity !== undefined && typeof voidedQuantity !== "string") return null;
  try {
    const amount = storedVnd(payload.amount);
    const difference = storedVnd(payload.difference);
    const refundAmount = storedVnd(payload.refundAmount);
    return {
      key: approval.action_key,
      ...(discountRate === undefined ? {} : { discountRate: discountRate as BasisPoints }),
      ...(amount === undefined ? {} : { amount }),
      ...(difference === undefined ? {} : { difference }),
      ...(refundAmount === undefined ? {} : { refundAmount }),
      ...(voidedQuantity === undefined ? {} : { voidedQuantity: quantity(voidedQuantity) }),
      ...(subject === undefined ? {} : { subject: subjectOf(subject) }),
    };
  } catch {
    return null;
  }
}

function storedVnd(value: unknown): Vnd | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new TypeError("money is not a decimal string");
  return vnd(BigInt(value));
}

function subjectOf(stored: unknown): ApprovalSubject {
  if (typeof stored !== "object" || stored === null) throw new TypeError("subject is no object");
  const ids: Record<string, string> = {};
  for (const field of ["orderId", "lineId", "shiftId"]) {
    const value = (stored as Record<string, unknown>)[field];
    if (value === undefined) continue;
    if (typeof value !== "string") throw new TypeError(`${field} is not an id`);
    ids[field] = value;
  }
  return ids;
}
