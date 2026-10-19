import { newId, withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import { hashSecret } from "../../security/secret-hash";
import { pinProblem } from "../../staff/pin-rules";
import { STAFF_ERROR_CODES } from "../../staff/staff-error-codes";
import { uuidJsonSchema } from "../../http/uuid-schema";

interface CreateStaffBody {
  displayName: string;
  roleId: string;
  pin: string;
  branchIds: string[];
}

const createStaffBody = {
  type: "object",
  additionalProperties: false,
  required: ["displayName", "roleId", "pin", "branchIds"],
  properties: {
    displayName: { type: "string", minLength: 1, maxLength: 80, pattern: "\\S" },
    roleId: uuidJsonSchema,
    // No pattern here: a malformed PIN gets its own code, not the generic 400.
    pin: { type: "string", maxLength: 16 },
    branchIds: {
      type: "array",
      minItems: 1,
      maxItems: 100,
      uniqueItems: true,
      items: uuidJsonSchema,
    },
  },
} as const;

export function registerCreateStaffRoute(app: FastifyInstance, context: ApiContext): void {
  app.post<{ Body: CreateStaffBody }>(
    "/staff",
    {
      onRequest: [context.requireSession, context.requirePermission("manage_staff")],
      schema: { body: createStaffBody },
    },
    async (request, reply) => {
      const auth = backofficeAuth(request);
      const { displayName, roleId, pin, branchIds } = request.body;
      const problem = pinProblem(pin);
      if (problem !== null) {
        const code =
          problem === "format" ? STAFF_ERROR_CODES.pinFormat : STAFF_ERROR_CODES.pinTooWeak;
        return reply.code(400).send({ code });
      }
      // Hashed before the transaction opens: the hash is the slow part, and it must not
      // hold a connection or locks while it runs.
      const pinHash = await hashSecret(pin);
      const now = context.clock.now();
      const staffId = newId();
      const outcome = await withTenant(context.pool, auth.tenantId, async (client) => {
        const role = await client.query("SELECT 1 FROM role WHERE id = $1", [roleId]);
        if (role.rowCount === 0) return STAFF_ERROR_CODES.roleNotFound;
        const branches = await client.query("SELECT id FROM branch WHERE id = ANY($1::uuid[])", [
          branchIds,
        ]);
        if (branches.rowCount !== branchIds.length) return STAFF_ERROR_CODES.branchNotFound;
        await client.query(
          "INSERT INTO staff (id, tenant_id, display_name, role_id, pin_hash, created_at, " +
            "updated_at, created_by) VALUES ($1, $2, $3, $4, $5, $6, $6, $7)",
          [staffId, auth.tenantId, displayName.trim(), roleId, pinHash, now, auth.appUserId],
        );
        for (const branchId of branchIds) {
          await client.query(
            "INSERT INTO staff_branch (id, tenant_id, staff_id, branch_id, created_at, " +
              "updated_at, created_by) VALUES ($1, $2, $3, $4, $5, $5, $6)",
            [newId(), auth.tenantId, staffId, branchId, now, auth.appUserId],
          );
        }
        return null;
      });
      if (outcome !== null) return reply.code(404).send({ code: outcome });
      return reply.code(201).send({ staffId });
    },
  );
}
