import { appendAudit, withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import { ROLE_ERROR_CODES } from "../../roles/role-error-codes";
import { ROLE_COLUMNS, type RoleRow, roleParams, roleView } from "../../roles/role-representation";

/**
 * Putting away a role nobody holds. Anyone still holding it, staff locked out of the tills
 * and suspended members too, is named in the refusal, so the manager knows whom to move
 * first; nobody's rights change as a side effect of tidying the list. The role row is
 * locked, and a role is given to someone only under a share lock of it, so a hire running
 * at the same moment is either seen here or refused the archived role.
 */
export function registerArchiveRoleRoute(app: FastifyInstance, context: ApiContext): void {
  app.post<{ Params: { id: string } }>(
    "/roles/:id/archive",
    {
      onRequest: [context.requireSession, context.requirePermission("manage_staff")],
      schema: { params: roleParams },
    },
    async (request, reply) => {
      const { tenantId, appUserId } = backofficeAuth(request);
      const roleId = request.params.id;
      const now = context.clock.now();
      const outcome = await withTenant(context.pool, tenantId, async (client) => {
        const found = await client.query<RoleRow>(
          `SELECT ${ROLE_COLUMNS} FROM role WHERE id = $1 FOR UPDATE`,
          [roleId],
        );
        const role = found.rows[0];
        if (role === undefined)
          return { status: 404, body: { code: ROLE_ERROR_CODES.roleNotFound } };
        if (role.archived_at !== null) {
          return { status: 409, body: { code: ROLE_ERROR_CODES.roleArchived } };
        }
        const staff = await client.query<{ id: string; display_name: string; active: boolean }>(
          "SELECT id, display_name, active FROM staff WHERE role_id = $1 ORDER BY display_name, id",
          [roleId],
        );
        const members = await client.query<{ id: string; display_name: string; status: string }>(
          "SELECT m.id, u.display_name, m.status FROM membership m JOIN app_user u " +
            "ON u.tenant_id = m.tenant_id AND u.id = m.app_user_id WHERE m.role_id = $1 " +
            "ORDER BY u.display_name, m.id",
          [roleId],
        );
        if (staff.rows.length > 0 || members.rows.length > 0) {
          const body = {
            code: ROLE_ERROR_CODES.roleInUse,
            staff: staff.rows.map((row) => ({
              id: row.id,
              displayName: row.display_name,
              active: row.active,
            })),
            members: members.rows.map((row) => ({
              id: row.id,
              displayName: row.display_name,
              status: row.status,
            })),
          };
          return { status: 409, body };
        }
        const archived = await client.query<RoleRow>(
          "UPDATE role SET archived_at = $2, updated_at = $2, version = version + 1 " +
            `WHERE id = $1 RETURNING ${ROLE_COLUMNS}`,
          [roleId, now],
        );
        await appendAudit(client, {
          actor: { kind: "app_user", id: appUserId },
          action: "role.archived",
          entityKind: "role",
          entityId: roleId,
          payload: { name: role.name },
        });
        return { status: 200, body: roleView(archived.rows[0] as RoleRow) };
      });
      return reply.code(outcome.status).send(outcome.body);
    },
  );
}
