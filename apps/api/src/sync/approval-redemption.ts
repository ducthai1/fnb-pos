import { newId } from "@fnb/db";
import type { PermissionAction } from "@fnb/domain";
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
 * outage over a rush. Without it the till's own date would be the only check, and a till
 * whose clock was turned back (or a hand-edited command) could keep an approval for days;
 * with it, for at most two hours.
 */
export const APPROVAL_SYNC_DELAY_MS = 2 * 60 * 60_000;

interface ApprovalRow {
  action_key: string;
  requested_by_staff_id: string;
  approved_by_staff_id: string;
  device_id: string;
  payload: { discountRate?: unknown; amount?: unknown };
  created_at: Date;
  /** The database's clock now; approvals are timed by it too, so the two compare. */
  checked_at: Date;
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
 * have been asked by this staff member on this till, for this action with this very rate
 * or amount (an approval for 600.000 đ covers neither 500.000 đ nor 800.000 đ: the manager
 * agreed to one figure), in time (see `timely`), and not be used yet by any command
 * of any kind. The use is recorded in the command's transaction, so a command refused
 * later gives the approval back.
 */
export async function redeemApproval(
  context: SyncCommandContext,
  approvalId: string,
  action: PermissionAction,
): Promise<string> {
  const { client, device, staffId, command } = context;
  const { rows } = await client.query<ApprovalRow>(
    "SELECT action_key, requested_by_staff_id, approved_by_staff_id, device_id, payload, " +
      "created_at, now() AS checked_at FROM approval_log WHERE id = $1",
    [approvalId],
  );
  const approval = rows[0];
  if (approval === undefined) throw new CommandRejection(SYNC_ERROR_CODES.approvalNotFound);
  if (approval.requested_by_staff_id !== staffId || approval.device_id !== device.deviceId) {
    throw new CommandRejection(SYNC_ERROR_CODES.approvalNotForThisStaff);
  }
  if (!approves(approval, action)) {
    throw new CommandRejection(SYNC_ERROR_CODES.approvalForAnotherAction);
  }
  if (!timely(approval, Date.parse(command.createdAt))) {
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
function timely(approval: ApprovalRow, recordedAt: number): boolean {
  const givenAt = approval.created_at.getTime();
  return (
    recordedAt >= givenAt - APPROVAL_TILL_CLOCK_SLACK_MS &&
    recordedAt <= givenAt + APPROVAL_VALID_FOR_MS &&
    approval.checked_at.getTime() - givenAt <= APPROVAL_SYNC_DELAY_MS
  );
}

/**
 * The approval route stores the rate as a number and the amount as a decimal string, and
 * leaves out the one the action does not carry; both must match, absent ones included.
 */
function approves(approval: ApprovalRow, action: PermissionAction): boolean {
  const amount = action.amount === undefined ? undefined : action.amount.toString();
  return (
    approval.action_key === action.key &&
    approval.payload.discountRate === action.discountRate &&
    approval.payload.amount === amount
  );
}
