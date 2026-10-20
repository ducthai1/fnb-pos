import { staffUpdateBodySchema } from "@fnb/contracts";
import { appendAudit, withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { AUTH_ERROR_CODES } from "../../auth/auth-error-codes";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import { announceStaffToTills } from "../../staff/announce-staff-to-tills";
import { STAFF_ERROR_CODES } from "../../staff/staff-error-codes";
import {
  type StaffAdminOutcome,
  assignableRoleProblem,
  lockedStaff,
  refusedWith,
  staffAdminGate,
  staffParams,
} from "./staff-admin-support";

/**
 * Renaming someone, or moving them to another role. A new role holds from their next
 * request at the till, as every request reads the role again; a new name reaches the
 * PIN screens of their branches through the change feed. Both go on the audit trail with
 * what they were before.
 */
export function registerUpdateStaffRoute(app: FastifyInstance, context: ApiContext): void {
  app.patch<{ Params: { id: string } }>(
    "/staff/:id",
    { onRequest: staffAdminGate(context), schema: { params: staffParams } },
    async (request, reply) => {
      const body = staffUpdateBodySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ code: AUTH_ERROR_CODES.invalidRequest });
      const { tenantId, appUserId } = backofficeAuth(request);
      const staffId = request.params.id;
      const { displayName, roleId } = body.data;
      const outcome = await withTenant(
        context.pool,
        tenantId,
        async (client): Promise<StaffAdminOutcome<null>> => {
          const before = await lockedStaff(client, staffId);
          if (before === null) return refusedWith(404, STAFF_ERROR_CODES.staffNotFound);
          if (roleId !== undefined && roleId !== before.role_id) {
            const problem = await assignableRoleProblem(client, roleId);
            if (problem !== null) return refusedWith(problem.status, problem.code);
          }
          await client.query(
            "UPDATE staff SET display_name = coalesce($2, display_name), " +
              "role_id = coalesce($3, role_id), updated_at = $4, version = version + 1 WHERE id = $1",
            [staffId, displayName ?? null, roleId ?? null, context.clock.now()],
          );
          await appendAudit(client, {
            actor: { kind: "app_user", id: appUserId },
            action: "staff.updated",
            entityKind: "staff",
            entityId: staffId,
            payload: {
              before: { displayName: before.display_name, roleId: before.role_id },
              after: {
                displayName: displayName ?? before.display_name,
                roleId: roleId ?? before.role_id,
              },
            },
          });
          if (displayName !== undefined && displayName !== before.display_name) {
            await announceStaffToTills(client, tenantId, staffId);
          }
          return { ok: true, value: null };
        },
      );
      if (!outcome.ok) return reply.code(outcome.status).send({ code: outcome.code });
      return reply.code(204).send();
    },
  );
}
