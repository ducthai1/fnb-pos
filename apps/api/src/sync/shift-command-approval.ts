import { type PermissionAction, authorize } from "@fnb/domain";
import type pg from "pg";
import { loadRoleGrants } from "../permissions/role-grants-store";
import { SHIFT_SYNC_ERROR_CODES as C } from "./shift-sync-error-codes";
import type { SyncCommandContext } from "./sync-command-context";
import { CommandRejection, SYNC_ERROR_CODES } from "./sync-error-codes";

interface ApprovalRow {
  action_key: string;
  requested_by_staff_id: string;
  device_id: string;
  payload: { amount?: unknown };
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
 * Whether the staff member signed in on the till may do `action`, judged on their role as
 * it is now. When they may not do it alone, the approval must have been granted to them,
 * on this till, for this very action, for at least the amount judged (an approval for
 * 600.000 đ does not cover 800.000 đ), and not have been used before: `isUsed` asks the
 * table that records what the approval was spent on. Returns the approval spent, or null
 * when none was needed.
 */
export async function authorizeShiftAction(
  context: SyncCommandContext,
  action: PermissionAction,
  approvalId: string | undefined,
  isUsed: (client: pg.ClientBase, approvalId: string) => Promise<boolean>,
): Promise<string | null> {
  const { client, device, staffId } = context;
  const decision = authorize(action, await staffGrants(client, staffId));
  if (decision === "allowed") return null;
  if (decision === "denied") throw new CommandRejection(C.permissionDenied);
  if (approvalId === undefined) throw new CommandRejection(C.approvalRequired);
  const { rows } = await client.query<ApprovalRow>(
    "SELECT action_key, requested_by_staff_id, device_id, payload FROM approval_log WHERE id = $1",
    [approvalId],
  );
  const approval = rows[0];
  const fits =
    approval !== undefined &&
    approval.action_key === action.key &&
    approval.requested_by_staff_id === staffId &&
    approval.device_id === device.deviceId &&
    coversAmount(approval.payload.amount, action.amount);
  if (!fits) throw new CommandRejection(C.approvalInvalid);
  if (await isUsed(client, approvalId)) throw new CommandRejection(C.approvalAlreadyUsed);
  return approvalId;
}

/** Approved amounts are stored as decimal strings, as every amount in an audit payload. */
function coversAmount(approved: unknown, needed: bigint | undefined): boolean {
  if (needed === undefined) return true;
  if (typeof approved !== "string" || !/^\d{1,19}$/.test(approved)) return false;
  return BigInt(approved) >= needed;
}

async function staffGrants(client: pg.ClientBase, staffId: string) {
  const { rows } = await client.query<{ role_id: string }>(
    "SELECT role_id FROM staff WHERE id = $1",
    [staffId],
  );
  const roleId = rows[0]?.role_id;
  if (roleId === undefined) throw new Error(`staff ${staffId} of a live session is missing`);
  return loadRoleGrants(client, roleId);
}
