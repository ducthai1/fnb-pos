import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import type pg from "pg";
import type { ApiContext } from "./api-context";
import { AUTH_ERROR_CODES } from "./auth/auth-error-codes";
import { type AuthPolicy, DEFAULT_AUTH_POLICY } from "./auth/auth-policy";
import { backofficeSessionHook } from "./auth/backoffice-session-hook";
import { type Clock, systemClock } from "./clock";
import { registerLoginRoute } from "./routes/auth/login-route";
import { registerSessionRoutes } from "./routes/auth/session-routes";

export interface AppDependencies {
  /** Connects as the app role: DML only, bound by row level security. */
  pool: pg.Pool;
  clock?: Clock;
  policy?: AuthPolicy;
}

/**
 * The HTTP API. Tenant scoping rule for every route added here: a request never chooses
 * its tenant. There is deliberately no header, query or body field that sets it; the
 * tenant comes from the authenticated session, and tenant queries run inside
 * `withTenant(pool, session.tenantId, ...)`. Trusting a client-supplied tenant id would
 * turn row level security into a formality.
 */
export function buildApp({ pool, clock, policy }: AppDependencies): FastifyInstance {
  const app = Fastify({ logger: false });
  const resolvedClock = clock ?? systemClock;
  const context: ApiContext = {
    pool,
    clock: resolvedClock,
    policy: policy ?? DEFAULT_AUTH_POLICY,
    requireSession: backofficeSessionHook(pool, resolvedClock),
  };

  app.decorateRequest("auth", null);

  // Error bodies carry a stable code only: no stack, SQL or library message reaches a
  // client, and a malformed request is told apart from a server fault by status alone.
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    const status = error.statusCode ?? 500;
    if (error.validation !== undefined || (status >= 400 && status < 500)) {
      return reply.code(error.validation !== undefined ? 400 : status).send({
        code: AUTH_ERROR_CODES.invalidRequest,
      });
    }
    return reply.code(500).send({ code: AUTH_ERROR_CODES.internal });
  });

  // Readiness: answers 503 while the database is unreachable, so a load balancer stops
  // routing here instead of every request failing.
  app.get("/health", async (_request, reply) => {
    try {
      await pool.query("SELECT 1");
      return { status: "ok", database: "ok" };
    } catch {
      return reply.code(503).send({ status: "unavailable", database: "unreachable" });
    }
  });

  registerLoginRoute(app, context);
  registerSessionRoutes(app, context);

  return app;
}
