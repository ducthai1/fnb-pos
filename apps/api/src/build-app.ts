import Fastify, { type FastifyInstance } from "fastify";
import type pg from "pg";

export interface AppDependencies {
  /** Connects as the app role: DML only, bound by row level security. */
  pool: pg.Pool;
}

/**
 * The HTTP API. Tenant scoping rule for every route added here: a request never chooses
 * its tenant. There is deliberately no header, query or body field that sets it; the
 * tenant comes from the authenticated session, and tenant queries run inside
 * `withTenant(pool, session.tenantId, ...)`. Trusting a client-supplied tenant id would
 * turn row level security into a formality.
 */
export function buildApp({ pool }: AppDependencies): FastifyInstance {
  const app = Fastify({ logger: false });

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

  return app;
}
