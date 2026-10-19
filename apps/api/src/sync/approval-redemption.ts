import { newId } from "@fnb/db";
import type { PermissionAction } from "@fnb/domain";
import type { SyncCommandContext } from "./sync-command-context";
import { CommandRejection, SYNC_ERROR_CODES } from "./sync-error-codes";

/**
 * How far apart the approval and the command may be. A manager approves at the till a
 * moment before the cashier acts, so ten minutes is plenty for a slow customer and short
 * enough that an approval cannot be kept for a later order. It is measured from when the
 * till recorded the command, not when it synced, so a till that went offline right after
 * still has its approval honoured; either way round, since the two clocks can differ.
 */
export const APPROVAL_VALID_FOR_MS = 10 * 60_000;

interface ApprovalRow {
  action_key: string;
  requested_by_staff_id: string;
  approved_by_staff_id: string;
  device_id: string;
  payload: { discountRate?: unknown; amount?: unknown };
  created_at: Date;
}

/**
 * Uses on-the-spot approval `approvalId` for `action` and answers who approved it. It must
 * have been asked by this staff member on this till, for this action with this very rate
 * or amount, within APPROVAL_VALID_FOR_MS, and not be used yet. The use is recorded in the
 * command's transaction, so a command refused later gives the approval back.
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
  if (!approves(approval, action)) {
    throw new CommandRejection(SYNC_ERROR_CODES.approvalForAnotherAction);
  }
  const gap = Math.abs(Date.parse(command.createdAt) - approval.created_at.getTime());
  if (!(gap <= APPROVAL_VALID_FOR_MS)) throw new CommandRejection(SYNC_ERROR_CODES.approvalExpired);
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
