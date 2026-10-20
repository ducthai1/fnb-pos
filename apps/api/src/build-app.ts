import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import type pg from "pg";
import type { ApiContext } from "./api-context";
import { AUTH_ERROR_CODES } from "./auth/auth-error-codes";
import { type AuthPolicy, DEFAULT_AUTH_POLICY } from "./auth/auth-policy";
import { backofficeSessionHook } from "./auth/backoffice-session-hook";
import { type Clock, systemClock } from "./clock";
import { deviceAuthHook } from "./devices/device-auth-hook";
import { PAYMENT_GATEWAYS, gatewaysByKey } from "./payments/gateways/payment-gateways";
import type { PaymentGatewayAdapter } from "./payments/gateways/payment-gateway-adapter";
import { webhookSecretBox } from "./payments/webhook-secret-box";
import { requirePermissionHook } from "./permissions/require-permission";
import { registerLoginRoute } from "./routes/auth/login-route";
import { registerSessionRoutes } from "./routes/auth/session-routes";
import { registerCatalogRoutes } from "./routes/catalog/register-catalog-routes";
import { registerDeviceRoutes } from "./routes/devices/device-routes";
import { registerPairingRoutes } from "./routes/devices/pairing-routes";
import { registerFloorRoutes } from "./routes/floor/register-floor-routes";
import { registerPaymentBackofficeRoutes } from "./routes/payments/payment-backoffice-routes";
import { registerApprovalRoutes } from "./routes/pos/approval-routes";
import { registerPosBootstrapRoute } from "./routes/pos/bootstrap-route";
import { registerStaffSessionRoutes } from "./routes/pos/staff-session-routes";
import { registerPrintFailureRoutes } from "./routes/reports/print-failure-routes";
import { registerListAndCreateRoleRoutes } from "./routes/roles/list-and-create-role-routes";
import { registerUpdateAndDeleteRoleRoutes } from "./routes/roles/update-and-delete-role-routes";
import { registerCreateStaffRoute } from "./routes/staff/create-staff-route";
import { registerSyncRoutes } from "./routes/sync/register-sync-routes";
import { registerPaymentWebhookRoute } from "./routes/webhooks/payment-webhook-route";
import { type SecretVerifier, verifySecret } from "./security/secret-hash";

export interface AppDependencies {
  /** Connects as the app role: DML only, bound by row level security. */
  pool: pg.Pool;
  clock?: Clock;
  policy?: AuthPolicy;
  /** Tests pass a wrapper that counts calls; the hash check itself is always the real one. */
  verifySecret?: SecretVerifier;
  /**
   * The 32-byte key gateway secrets are sealed with (see paymentSecretKeyFromEnv). Without
   * it the server takes no gateway notices and stores no gateway secrets.
   */
  paymentSecretKey?: Buffer;
  /** The gateways notices are taken from; SePay and PayOS unless a test adds its fake. */
  paymentGateways?: readonly PaymentGatewayAdapter[];
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
  registerPosBootstrapRoute(app, context);
  registerCatalogRoutes(app, context);
  registerFloorRoutes(app, context);
  registerSyncRoutes(app, context);
  registerPrintFailureRoutes(app, context);
  const payments = {
    gateways: gatewaysByKey(dependencies.paymentGateways ?? PAYMENT_GATEWAYS),
    secretBox:
      dependencies.paymentSecretKey === undefined
        ? null
        : webhookSecretBox(dependencies.paymentSecretKey),
  };
  registerPaymentWebhookRoute(app, context, payments);
  registerPaymentBackofficeRoutes(app, context, payments);

  return app;
}
