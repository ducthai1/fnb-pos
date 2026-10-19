import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import type pg from "pg";
import type { ApiContext } from "./api-context";
import { AUTH_ERROR_CODES } from "./auth/auth-error-codes";
import { type AuthPolicy, DEFAULT_AUTH_POLICY } from "./auth/auth-policy";
import { backofficeSessionHook } from "./auth/backoffice-session-hook";
import { type Clock, systemClock } from "./clock";
import { deviceAuthHook } from "./devices/device-auth-hook";
import { requirePermissionHook } from "./permissions/require-permission";
import { registerLoginRoute } from "./routes/auth/login-route";
import { registerSessionRoutes } from "./routes/auth/session-routes";
import { registerCatalogRoutes } from "./routes/catalog/register-catalog-routes";
import { registerDeviceRoutes } from "./routes/devices/device-routes";
import { registerPairingRoutes } from "./routes/devices/pairing-routes";
import { registerApprovalRoutes } from "./routes/pos/approval-routes";
import { registerStaffSessionRoutes } from "./routes/pos/staff-session-routes";
import { registerListAndCreateRoleRoutes } from "./routes/roles/list-and-create-role-routes";
import { registerUpdateAndDeleteRoleRoutes } from "./routes/roles/update-and-delete-role-routes";
import { registerCreateStaffRoute } from "./routes/staff/create-staff-route";
import { type SecretVerifier, verifySecret } from "./security/secret-hash";

export interface AppDependencies {
  /** Connects as the app role: DML only, bound by row level security. */
  pool: pg.Pool;
  clock?: Clock;
  policy?: AuthPolicy;
  /** Tests pass a wrapper that counts calls; the hash check itself is always the real one. */
  verifySecret?: SecretVerifier;
}

/**
 * The HTTP API. Tenant scoping rule for every route added here: a request never chooses
 * its tenant. There is deliberately no header, query or body field that sets it; the
 * tenant comes from the authenticated session (request.auth) or the till's credential
 * (request.device), and tenant queries run inside `withTenant(pool, tenantId, ...)`.
 * Trusting a client-supplied tenant id would turn row level security into a formality.
 */
export function buildApp(dependencies: AppDependencies): FastifyInstance {
  const { pool, clock, policy } = dependencies;
  const app = Fastify({ logger: false });
  const resolvedClock = clock ?? systemClock;
  const context: ApiContext = {
    pool,
    clock: resolvedClock,
    policy: policy ?? DEFAULT_AUTH_POLICY,
    verifySecret: dependencies.verifySecret ?? verifySecret,
    requireSession: backofficeSessionHook(pool, resolvedClock),
    requireDevice: deviceAuthHook(pool),
    requirePermission: requirePermissionHook(pool),
  };

  app.decorateRequest("auth", null);
  app.decorateRequest("device", null);

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
  registerPairingRoutes(app, context);
  registerDeviceRoutes(app, context);
  registerCreateStaffRoute(app, context);
  registerListAndCreateRoleRoutes(app, context);
  registerUpdateAndDeleteRoleRoutes(app, context);
  registerStaffSessionRoutes(app, context);
  registerApprovalRoutes(app, context);
  registerCatalogRoutes(app, context);

  return app;
}
