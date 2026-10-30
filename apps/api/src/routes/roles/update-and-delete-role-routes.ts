import { expectedVersionQuerySchema } from "@fnb/contracts";
import { appendAudit, withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { AUTH_ERROR_CODES } from "../../auth/auth-error-codes";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import { clientPermissionErrorCode } from "../../permissions/permission-error-codes";
import {
  administratorRemainsWithout,
  lockAdministration,
} from "../../roles/last-administrator-guard";
import { ROLE_ERROR_CODES } from "../../roles/role-error-codes";
import {
  ROLE_COLUMNS,
  type RoleRow,
  canonicalGrants,
  roleParams,
  roleView,
  updateRoleBody,
} from "../../roles/role-representation";

interface UpdateRoleBody {
  name?: string;
  permissionKeys?: string[];
  thresholds?: Record<string, unknown>;
}

const FOREIGN_KEY_VIOLATION = "23503";

export function registerUpdateAndDeleteRoleRoutes(app: FastifyInstance, context: ApiContext): void {
  const gate = [context.requireSession, context.requirePermission("manage_staff")];

  // A role of another tenant is invisible under row level security: 404, as for an id
  // that never existed.
  app.patch<{ Params: { id: string }; Body: UpdateRoleBody }>(
    "/roles/:id",
    { onRequest: gate, schema: { params: roleParams, body: updateRoleBody } },
    async (request, reply) => {
      const expected = expectedVersionQuerySchema.safeParse(request.query);
      if (!expected.success) return reply.code(400).send({ code: AUTH_ERROR_CODES.invalidRequest });
      const auth = backofficeAuth(request);
      const { name, permissionKeys, thresholds } = request.body;
      let stored;
      try {
        stored =
          permissionKeys === undefined ? undefined : canonicalGrants(permissionKeys, thresholds);
      } catch (error) {
        const code = clientPermissionErrorCode(error);
        if (code === null) throw error;
        return reply.code(400).send({ code });
      }
      const now = context.clock.now();
      const outcome = await withTenant(context.pool, auth.tenantId, async (client) => {
        await lockAdministration(client);
        const found = await client.query<RoleRow>(
          `SELECT ${ROLE_COLUMNS} FROM role WHERE id = $1 FOR UPDATE`,
          [request.params.id],
        );
        const before = found.rows[0];
        if (before === undefined) return { refused: ROLE_ERROR_CODES.roleNotFound };
        // As of the version the caller read: a role changed since is not overwritten.
        if (before.version !== expected.data.version) {
          return { refused: ROLE_ERROR_CODES.versionConflict };
        }
        const losesAdministration =
          stored !== undefined &&
          before.permission_keys.includes("manage_staff") &&
          !stored.permissionKeys.includes("manage_staff");
        if (losesAdministration && !(await administratorRemainsWithout(client, before.id))) {
          return { refused: ROLE_ERROR_CODES.lastAdministrator };
        }
        const updated = await client.query<RoleRow>(
          "UPDATE role SET name = COALESCE($2, name), permission_keys = COALESCE($3, permission_keys), " +
            "thresholds = COALESCE($4, thresholds), updated_at = $5, version = version + 1 " +
            `WHERE id = $1 RETURNING ${ROLE_COLUMNS}`,
          [
            before.id,
            name?.trim() ?? null,
            stored?.permissionKeys ?? null,
            stored?.thresholds ?? null,
            now,
          ],
        );
        await appendAudit(client, {
          actor: { kind: "app_user", id: auth.appUserId },
          action: "role.updated",
          entityKind: "role",
          entityId: before.id,
          payload: { name: name?.trim(), ...stored },
        });
        return { role: roleView(updated.rows[0] as RoleRow) };
      });
      if ("refused" in outcome) {
        const status = outcome.refused === ROLE_ERROR_CODES.roleNotFound ? 404 : 409;
        return reply.code(status).send({ code: outcome.refused });
      }
      return outcome.role;
    },
  );

  // Deleting is for roles nobody holds. Staff and members are moved to another role
  // first, so nobody's rights change as a side effect of tidying up the role list. The
  // foreign keys of staff and membership refuse it, also when someone is given the role
  // while the delete runs, and they count staff who left and suspended members too.
  app.delete<{ Params: { id: string } }>(
    "/roles/:id",
    { onRequest: gate, schema: { params: roleParams } },
    async (request, reply) => {
      const expected = expectedVersionQuerySchema.safeParse(request.query);
      if (!expected.success) return reply.code(400).send({ code: AUTH_ERROR_CODES.invalidRequest });
      const auth = backofficeAuth(request);
      const roleId = request.params.id;
      let deleted: "gone" | "missing" | "changed";
      try {
        deleted = await withTenant(context.pool, auth.tenantId, async (client) => {
          const found = await client.query<{ version: number }>(
            "SELECT version FROM role WHERE id = $1 FOR UPDATE",
            [roleId],
          );
          if (found.rows[0] === undefined) return "missing" as const;
          // As of the version the caller read: a role edited since is not deleted unseen.
          if (found.rows[0].version !== expected.data.version) return "changed" as const;
          await client.query("DELETE FROM role WHERE id = $1", [roleId]);
          await appendAudit(client, {
            actor: { kind: "app_user", id: auth.appUserId },
            action: "role.deleted",
            entityKind: "role",
            entityId: roleId,
          });
          return "gone" as const;
        });
      } catch (error) {
        if ((error as { code?: unknown }).code !== FOREIGN_KEY_VIOLATION) throw error;
        return reply.code(409).send({ code: ROLE_ERROR_CODES.roleInUse });
      }
      if (deleted === "missing")
        return reply.code(404).send({ code: ROLE_ERROR_CODES.roleNotFound });
      if (deleted === "changed") {
        return reply.code(409).send({ code: ROLE_ERROR_CODES.versionConflict });
      }
      return reply.code(204).send();
    },
  );
}
