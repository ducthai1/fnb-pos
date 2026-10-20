import type { StaffSummary } from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { backofficeAuth } from "../../auth/backoffice-session-hook";

interface StaffRow {
  id: string;
  display_name: string;
  role_id: string;
  active: boolean;
  branch_ids: string[];
  pin_locked_until: Date | null;
  pin_failed_attempts: number;
}

// Columns named one by one: the PIN hash sits in the same row and must never be selected
// into an answer, not even to be dropped later. The lockout state is shown, so a manager
// sees whom wrong PINs keep out; a lock that ran out reads as none.
const LIST_STAFF =
  "SELECT s.id, s.display_name, s.role_id, s.active, s.pin_failed_attempts, " +
  "CASE WHEN s.pin_locked_until > $1 THEN s.pin_locked_until END AS pin_locked_until, " +
  "ARRAY(SELECT sb.branch_id FROM staff_branch sb WHERE sb.tenant_id = s.tenant_id " +
  "AND sb.staff_id = s.id ORDER BY sb.branch_id) AS branch_ids " +
  "FROM staff s ORDER BY s.display_name, s.id";

/**
 * Everyone who signs in at the tills, inactive members too, with their role and branches.
 * Who works where and in which role is what manage_staff manages, so listing takes it too.
 */
export function registerStaffListRoute(app: FastifyInstance, context: ApiContext): void {
  app.get(
    "/staff",
    { onRequest: [context.requireSession, context.requirePermission("manage_staff")] },
    async (request) => {
      const { rows } = await withTenant(context.pool, backofficeAuth(request).tenantId, (client) =>
        client.query<StaffRow>(LIST_STAFF, [context.clock.now()]),
      );
      const staff: StaffSummary[] = rows.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        roleId: row.role_id,
        active: row.active,
        branchIds: row.branch_ids,
        lockedOutUntil: row.pin_locked_until?.toISOString() ?? null,
        failedSignIns: row.pin_failed_attempts,
      }));
      return { staff };
    },
  );
}
