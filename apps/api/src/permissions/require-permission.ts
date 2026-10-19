import { withTenant } from "@fnb/db";
import { type UnlimitedPermissionKey, authorize } from "@fnb/domain";
import type { FastifyReply, FastifyRequest } from "fastify";
import type pg from "pg";
import { backofficeAuth } from "../auth/backoffice-session-hook";
import { PERMISSION_ERROR_CODES } from "./permission-error-codes";
import { loadRoleGrants } from "./role-grants-store";

/**
 * onRequest hook, placed after the session hook: the member's role must allow `key`.
 * Only keys without a threshold gate a whole route; a capped key depends on the value
 * acted on, which a route checks itself.
 *
 * Nobody can approve on the spot in the backoffice, so a key that would need approval at
 * the till is refused here like a denied one. The grants are read on every request, so
 * taking a key away works at once rather than at the member's next sign-in. The check
 * runs before the body is validated, so a member without the key learns nothing about
 * which requests would have been accepted.
 */
export function requirePermissionHook(pool: pg.Pool) {
  return (key: UnlimitedPermissionKey) => async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = backofficeAuth(request);
    const grants = await withTenant(pool, auth.tenantId, (client) =>
      loadRoleGrants(client, auth.roleId),
    );
    if (authorize({ key }, grants) !== "allowed") {
      return reply.code(403).send({ code: PERMISSION_ERROR_CODES.denied });
    }
  };
}
