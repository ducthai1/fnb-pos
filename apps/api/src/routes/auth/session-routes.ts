import type { SignedInMember } from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import { PERMISSION_KEYS } from "@fnb/domain";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { revokeSession } from "../../auth/account-store";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import { clearedSessionCookie, readSessionToken } from "../../auth/session-cookie";
import { loadRoleGrants } from "../../permissions/role-grants-store";
import { hashToken } from "../../security/opaque-token";

export function registerSessionRoutes(app: FastifyInstance, context: ApiContext): void {
  // Revokes server-side, not just in the browser: a copied cookie dies with the logout.
  // Answers 204 even without a live session, so logging out twice is not an error.
  app.post("/auth/logout", async (request, reply) => {
    const token = readSessionToken(request.headers.cookie);
    if (token !== null) await revokeSession(context.pool, hashToken(token), context.clock.now());
    reply.header("set-cookie", clearedSessionCookie());
    return reply.code(204).send();
  });

  // permissionKeys are the keys the member's role holds as of this request, read like the
  // permission hook reads them, so a screen hides what its routes would refuse. They grant
  // nothing: every route checks its own key again.
  app.get("/auth/me", { onRequest: context.requireSession }, async (request) => {
    const auth = backofficeAuth(request);
    const { row, grants } = await withTenant(context.pool, auth.tenantId, async (client) => {
      const result = await client.query<{ organization_name: string; display_name: string }>(
        "SELECT o.name AS organization_name, u.display_name FROM app_user u " +
          "JOIN organization o ON o.id = u.tenant_id WHERE u.id = $1",
        [auth.appUserId],
      );
      return { row: result.rows[0], grants: await loadRoleGrants(client, auth.roleId) };
    });
    const member: SignedInMember = {
      accountId: auth.accountId,
      organizationId: auth.tenantId,
      organizationName: row?.organization_name ?? null,
      appUserId: auth.appUserId,
      displayName: row?.display_name ?? null,
      permissionKeys: PERMISSION_KEYS.filter((key) => grants.some((grant) => grant.key === key)),
    };
    return member;
  });
}
