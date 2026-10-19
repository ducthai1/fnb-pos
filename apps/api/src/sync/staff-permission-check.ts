import { type Grant, type PermissionAction, authorize } from "@fnb/domain";
import type pg from "pg";
import { loadRoleGrants } from "../permissions/role-grants-store";
import { approvalIdOf, redeemApproval } from "./approval-redemption";
import type { SyncCommandContext } from "./sync-command-context";
import { CommandRejection, SYNC_ERROR_CODES } from "./sync-error-codes";

/** An on-the-spot approval a command used up, and the manager who gave it. */
export interface SpentApproval {
  readonly approvalId: string;
  readonly approvedByStaffId: string;
}

/**
 * The grants of the staff member sending the command, read in the command's transaction,
 * so a role narrowed a moment ago is the role that is judged.
 */
export async function grantsOfStaff(client: pg.ClientBase, staffId: string): Promise<Grant[]> {
  const { rows } = await client.query<{ role_id: string }>(
    "SELECT role_id FROM staff WHERE id = $1",
    [staffId],
  );
  const roleId = rows[0]?.role_id;
  if (roleId === undefined) throw new Error(`staff ${staffId} of a signed-in till is missing`);
  return loadRoleGrants(client, roleId);
}

/**
 * Lets the command's staff member do `action`, for order and shift commands alike: alone
 * when one of their grants covers it, otherwise only on the strength of a manager's
 * approval of exactly this action, named in the payload (`inPayload`) or on the envelope,
 * which is then used up. Answers the approval spent, or null when nobody was needed.
 */
export async function requirePermission(
  context: SyncCommandContext,
  action: PermissionAction,
  inPayload: string | undefined,
): Promise<SpentApproval | null> {
  const approvalId = approvalIdOf(context, inPayload);
  const decision = authorize(action, await grantsOfStaff(context.client, context.staffId));
  if (decision === "allowed") return null;
  if (decision === "denied") throw new CommandRejection(SYNC_ERROR_CODES.permissionDenied);
  if (approvalId === undefined) throw new CommandRejection(SYNC_ERROR_CODES.approvalRequired);
  return { approvalId, approvedByStaffId: await redeemApproval(context, approvalId, action) };
}
