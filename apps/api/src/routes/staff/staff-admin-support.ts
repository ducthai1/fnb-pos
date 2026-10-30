import type pg from "pg";
import type { ApiContext } from "../../api-context";
import { uuidJsonSchema } from "../../http/uuid-schema";
import { STAFF_ERROR_CODES } from "../../staff/staff-error-codes";

/** Who works at the tills, in which role, and how they sign in is what manage_staff manages. */
export const staffAdminGate = (context: ApiContext) => [
  context.requireSession,
  context.requirePermission("manage_staff"),
];

export const staffParams = {
  type: "object",
  required: ["id"],
  properties: { id: uuidJsonSchema },
} as const;

export type StaffAdminOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly status: 404 | 409; readonly code: string };

export const refusedWith = (status: 404 | 409, code: string) =>
  ({ ok: false, status, code }) as const;

export interface LockedStaff {
  version: number;
  display_name: string;
  role_id: string;
  active: boolean;
  pin_failed_attempts: number;
  pin_locked_until: Date | null;
}

/** The staff row, locked for the rest of the transaction; another tenant's reads as missing. */
export async function lockedStaff(client: pg.ClientBase, id: string): Promise<LockedStaff | null> {
  const { rows } = await client.query<LockedStaff>(
    "SELECT version, display_name, role_id, active, pin_failed_attempts, pin_locked_until FROM staff " +
      "WHERE id = $1 FOR UPDATE",
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Whether a role may be given to someone: it exists and is not archived. Read FOR SHARE, so
 * an archive running at the same moment either finishes first (and this sees it) or waits
 * for this transaction and then finds the new holder.
 */
export async function assignableRoleProblem(
  client: pg.ClientBase,
  roleId: string,
): Promise<{ status: 404 | 409; code: string } | null> {
  const { rows } = await client.query<{ archived_at: Date | null }>(
    "SELECT archived_at FROM role WHERE id = $1 FOR SHARE",
    [roleId],
  );
  const role = rows[0];
  if (role === undefined) return { status: 404, code: STAFF_ERROR_CODES.roleNotFound };
  if (role.archived_at !== null) return { status: 409, code: STAFF_ERROR_CODES.roleArchived };
  return null;
}
