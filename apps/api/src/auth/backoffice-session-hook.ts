import { withTenant } from "@fnb/db";
import type { FastifyReply, FastifyRequest } from "fastify";
import type pg from "pg";
import type { Clock } from "../clock";
import { hashToken } from "../security/opaque-token";
import { findSession } from "./account-store";
import { AUTH_ERROR_CODES } from "./auth-error-codes";
import { readSessionToken } from "./session-cookie";

/** Who is calling, from the session cookie. Tenant routes run in withTenant(tenantId). */
export interface BackofficeAuth {
  sessionId: string;
  accountId: string;
  tenantId: string;
  appUserId: string;
  /** The membership's role; requirePermission reads its grants afresh on each request. */
  roleId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    auth: BackofficeAuth | null;
  }
}

/**
 * onRequest hook for backoffice routes: a live session whose membership is still active,
 * or 401. The membership is re-read on every request, so suspending a member locks them
 * out at once instead of when their session happens to expire.
 */
export function backofficeSessionHook(pool: pg.Pool, clock: Clock) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const token = readSessionToken(request.headers.cookie);
    const session = token === null ? null : await findSession(pool, hashToken(token), clock.now());
    if (session === null) {
      return reply.code(401).send({ code: AUTH_ERROR_CODES.unauthenticated });
    }
    const membership = await withTenant(pool, session.tenantId, (client) =>
      client.query<{ app_user_id: string; role_id: string }>(
        "SELECT app_user_id, role_id FROM membership WHERE account_id = $1 AND status = 'active'",
        [session.accountId],
      ),
    );
    const member = membership.rows[0];
    if (member === undefined) {
      return reply.code(401).send({ code: AUTH_ERROR_CODES.unauthenticated });
    }
    request.auth = { ...session, appUserId: member.app_user_id, roleId: member.role_id };
  };
}

/** The caller of a route behind backofficeSessionHook. */
export function backofficeAuth(request: FastifyRequest): BackofficeAuth {
  if (request.auth === null) throw new Error("route is missing backofficeSessionHook");
  return request.auth;
}
