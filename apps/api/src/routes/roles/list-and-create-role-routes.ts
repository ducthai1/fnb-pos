import { appendAudit, newId, withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import { clientPermissionErrorCode } from "../../permissions/permission-error-codes";
import {
  ROLE_COLUMNS,
  type RoleRow,
  canonicalGrants,
  createRoleBody,
  roleView,
} from "../../roles/role-representation";

interface CreateRoleBody {
  name: string;
  permissionKeys: string[];
  thresholds: Record<string, unknown>;
}

/** Roles decide who may do what, so reading and editing them both take manage_staff. */
export function registerListAndCreateRoleRoutes(app: FastifyInstance, context: ApiContext): void {
  const gate = [context.requireSession, context.requirePermission("manage_staff")];

  app.get("/roles", { onRequest: gate }, async (request) => {
    const auth = backofficeAuth(request);
    const result = await withTenant(context.pool, auth.tenantId, (client) =>
      client.query<RoleRow>(`SELECT ${ROLE_COLUMNS} FROM role ORDER BY id`),
    );
    return { roles: result.rows.map(roleView) };
  });

  app.post<{ Body: CreateRoleBody }>(
    "/roles",
    { onRequest: gate, schema: { body: createRoleBody } },
    async (request, reply) => {
      const auth = backofficeAuth(request);
      const { name, permissionKeys, thresholds } = request.body;
      let stored;
      try {
        stored = canonicalGrants(permissionKeys, thresholds);
      } catch (error) {
        const code = clientPermissionErrorCode(error);
        if (code === null) throw error;
        return reply.code(400).send({ code });
      }
      const now = context.clock.now();
      const roleId = newId();
      await withTenant(context.pool, auth.tenantId, async (client) => {
        await client.query(
          "INSERT INTO role (id, tenant_id, name, permission_keys, thresholds, created_at, " +
            "updated_at, created_by) VALUES ($1, $2, $3, $4, $5, $6, $6, $7)",
          [
            roleId,
            auth.tenantId,
            name.trim(),
            stored.permissionKeys,
            stored.thresholds,
            now,
            auth.appUserId,
          ],
        );
        await appendAudit(client, {
          actor: { kind: "app_user", id: auth.appUserId },
          action: "role.created",
          entityKind: "role",
          entityId: roleId,
          payload: { name: name.trim(), ...stored },
        });
      });
      return reply.code(201).send({ roleId });
    },
  );
}
