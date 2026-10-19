import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { revokeSession } from "../../auth/account-store";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import { clearedSessionCookie, readSessionToken } from "../../auth/session-cookie";
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

  app.get("/auth/me", { onRequest: context.requireSession }, async (request) => {
    const auth = backofficeAuth(request);
    const result = await withTenant(context.pool, auth.tenantId, (client) =>
      client.query<{ organization_name: string; display_name: string }>(
        "SELECT o.name AS organization_name, u.display_name FROM app_user u " +
          "JOIN organization o ON o.id = u.tenant_id WHERE u.id = $1",
        [auth.appUserId],
      ),
    );
    const row = result.rows[0];
    return {
      accountId: auth.accountId,
      organizationId: auth.tenantId,
      organizationName: row?.organization_name ?? null,
      appUserId: auth.appUserId,
      displayName: row?.display_name ?? null,
    };
  });
}
