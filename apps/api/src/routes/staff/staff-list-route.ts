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
}

// Columns named one by one: the PIN hash and the lockout counters sit in the same row and
// must never be selected into an answer, not even to be dropped later.
const LIST_STAFF =
  "SELECT s.id, s.display_name, s.role_id, s.active, " +
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
        client.query<StaffRow>(LIST_STAFF),
      );
      const staff: StaffSummary[] = rows.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        roleId: row.role_id,
        active: row.active,
        branchIds: row.branch_ids,
      }));
      return { staff };
    },
  );
}
