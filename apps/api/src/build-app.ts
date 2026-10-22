import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import type pg from "pg";
import type { ApiContext } from "./api-context";
import { AUTH_ERROR_CODES } from "./auth/auth-error-codes";
import { type AuthPolicy, DEFAULT_AUTH_POLICY } from "./auth/auth-policy";
import { backofficeSessionHook } from "./auth/backoffice-session-hook";
import { sessionCookieJar } from "./auth/session-cookie";
import { type Clock, systemClock } from "./clock";
import { deviceAuthHook } from "./devices/device-auth-hook";
import { type EInvoiceProvider, providersByKey } from "./einvoice/einvoice-provider";
import type { EInvoiceRetryPolicy } from "./einvoice/einvoice-retry-policy";
import { startEInvoiceWorker } from "./einvoice/einvoice-worker";
import { allowedOriginsHook } from "./http/allowed-origins-hook";
import { PAYMENT_GATEWAYS, gatewaysByKey } from "./payments/gateways/payment-gateways";
import type { PaymentGatewayAdapter } from "./payments/gateways/payment-gateway-adapter";
import { walletsByKey } from "./payments/wallets/wallet-gateway-adapter";
import type { WalletGatewayAdapter } from "./payments/wallets/wallet-gateway-adapter";
import { walletGateways } from "./payments/wallets/wallet-gateways";
import { startWalletPoller } from "./payments/wallets/wallet-status-poller";
import { webhookSecretBox } from "./payments/webhook-secret-box";
import { diskProductImageStore } from "./media/product-image-store";
import { requirePermissionHook } from "./permissions/require-permission";
import { registerLoginRoute } from "./routes/auth/login-route";
import { registerSessionRoutes } from "./routes/auth/session-routes";
import { registerBranchListRoute } from "./routes/branches/branch-list-route";
import { registerCatalogRoutes } from "./routes/catalog/register-catalog-routes";
import { registerDeviceListRoute } from "./routes/devices/device-list-route";
import { registerDeviceRoutes } from "./routes/devices/device-routes";
import { registerProductImageRoutes } from "./routes/media/product-image-routes";
import { registerPairingRoutes } from "./routes/devices/pairing-routes";
import { registerEInvoiceProfileRoutes } from "./routes/einvoice/einvoice-profile-routes";
import { registerFloorRoutes } from "./routes/floor/register-floor-routes";
import { registerPaymentBackofficeRoutes } from "./routes/payments/payment-backoffice-routes";
import { registerWalletAccountRoutes } from "./routes/payments/wallet-account-routes";
import { registerWalletPaymentRoute } from "./routes/pos/wallet-payment-route";
import { registerApprovalRoutes } from "./routes/pos/approval-routes";
import { registerPosBootstrapRoute } from "./routes/pos/bootstrap-route";
import { registerStaffSessionRoutes } from "./routes/pos/staff-session-routes";
import { registerDailySalesRoutes } from "./routes/reports/daily-sales-routes";
import { registerDayCloseRoutes } from "./routes/reports/day-close-routes";
import { registerPrintFailureRoutes } from "./routes/reports/print-failure-routes";
import { registerListAndCreateRoleRoutes } from "./routes/roles/list-and-create-role-routes";
import { registerArchiveRoleRoute } from "./routes/roles/archive-role-route";
import { registerUpdateAndDeleteRoleRoutes } from "./routes/roles/update-and-delete-role-routes";
import { registerSettingsRoutes } from "./routes/settings/settings-routes";
import { registerCreateStaffRoute } from "./routes/staff/create-staff-route";
import { registerStaffAccessRoutes } from "./routes/staff/staff-access-routes";
import { registerStaffListRoute } from "./routes/staff/staff-list-route";
import { registerUpdateStaffRoute } from "./routes/staff/update-staff-route";
import { registerSyncRoutes } from "./routes/sync/register-sync-routes";
import { registerPaymentWebhookRoute } from "./routes/webhooks/payment-webhook-route";
import { registerWalletNoticeRoute } from "./routes/webhooks/wallet-notice-route";
import { type ServerErrorReport, serverErrorReport } from "./http/server-error-report";
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
  /** The e-wallets branches may turn on; ZaloPay's sandbox unless the server says otherwise. */
  wallets?: readonly WalletGatewayAdapter[];
  /**
   * The server's public base URL (https://host), for the wallet's notices to come back to.
   * Without it no notice is asked for and pending wallet payments are settled by asking.
   */
  walletCallbackBase?: string;
  /** Asks the wallets about pending payments in this process while the app is up. */
  walletPoller?: { intervalMs: number; onError?: (error: unknown) => void };
  /** The invoice providers branches may name; none until a real adapter is written. */
  einvoiceProviders?: readonly EInvoiceProvider[];
  /**
   * Runs the invoice worker inside this process while the app is up. Off unless given, so
   * one process of a deployment (or a test) chooses to run it.
   */
  einvoiceWorker?: {
    intervalMs: number;
    policy?: EInvoiceRetryPolicy;
    onError?: (error: unknown) => void;
  };
  /**
   * Whether the session cookie is Secure (and `__Host-` prefixed). On unless a deployment
   * serves the backoffice over plain HTTP on purpose; production refuses to turn it off.
   */
  secureCookies?: boolean;
  /**
   * The browser origins (scheme://host:port) whose pages may send writes. Without a list
   * no Origin is checked, as when tests call the app directly.
   */
  allowedOrigins?: readonly string[];
  /**
   * Told of every request answered 500, secrets masked (see serverErrorReport): the client
   * learns only API_INTERNAL, so this is the one trace a server fault leaves.
   */
  onServerError?: (report: ServerErrorReport) => void;
  /** Where product photos are kept, a directory per tenant; without it uploads answer 503. */
  mediaDirectory?: string;
}

/**
 * The HTTP API. Tenant scoping rule for every route added here: a request never chooses
 * its tenant. There is deliberately no header, query or body field that sets it; the
 * tenant comes from the authenticated session (request.auth) or the till's credential
 * (request.device), and tenant queries run inside `withTenant(pool, tenantId, ...)`.
 * Trusting a client-supplied tenant id would turn row level security into a formality.
 */
export function buildApp(dependencies: AppDependencies): FastifyInstance {
  const { pool, clock, policy, mediaDirectory } = dependencies;
  const app = Fastify({ logger: false });
  const resolvedClock = clock ?? systemClock;
  const sessionCookies = sessionCookieJar({ secure: dependencies.secureCookies ?? true });
  const context: ApiContext = {
    pool,
    clock: resolvedClock,
    policy: policy ?? DEFAULT_AUTH_POLICY,
    sessionCookies,
    verifySecret: dependencies.verifySecret ?? verifySecret,
    requireSession: backofficeSessionHook(pool, resolvedClock, sessionCookies),
    requireDevice: deviceAuthHook(pool),
    requirePermission: requirePermissionHook(pool),
    productImages: mediaDirectory === undefined ? null : diskProductImageStore(mediaDirectory),
  };

  app.decorateRequest("auth", null);
  app.decorateRequest("device", null);
  if (dependencies.allowedOrigins !== undefined) {
    app.addHook("onRequest", allowedOriginsHook(dependencies.allowedOrigins));
  }

  // Error bodies carry a stable code only: no stack, SQL or library message reaches a
  // client, and a malformed request is told apart from a server fault by status alone.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const status = error.statusCode ?? 500;
    if (error.validation !== undefined || (status >= 400 && status < 500)) {
      return reply.code(error.validation !== undefined ? 400 : status).send({
        code: AUTH_ERROR_CODES.invalidRequest,
      });
    }
    const route = request.routeOptions.url ?? "(no route)";
    try {
      dependencies.onServerError?.(serverErrorReport(request.method, route, error));
    } catch {
      // A log that fails must not change what the client is told.
    }
    return reply.code(500).send({ code: AUTH_ERROR_CODES.internal });
  });

  // Readiness: 503 while the database is unreachable, so a load balancer routes elsewhere.
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
  registerBranchListRoute(app, context);
  registerDeviceRoutes(app, context);
  registerDeviceListRoute(app, context);
  registerCreateStaffRoute(app, context);
  registerStaffListRoute(app, context);
  registerUpdateStaffRoute(app, context);
  registerStaffAccessRoutes(app, context);
  registerListAndCreateRoleRoutes(app, context);
  registerUpdateAndDeleteRoleRoutes(app, context);
  registerArchiveRoleRoute(app, context);
  registerStaffSessionRoutes(app, context);
  registerApprovalRoutes(app, context);
  registerPosBootstrapRoute(app, context);
  registerCatalogRoutes(app, context);
  registerProductImageRoutes(app, context);
  registerFloorRoutes(app, context);
  registerSyncRoutes(app, context);
  registerPrintFailureRoutes(app, context);
  registerDailySalesRoutes(app, context);
  const payments = {
    gateways: gatewaysByKey(dependencies.paymentGateways ?? PAYMENT_GATEWAYS),
    wallets: walletsByKey(dependencies.wallets ?? walletGateways("sandbox")),
    walletCallbackBase: dependencies.walletCallbackBase?.replace(/\/+$/, "") ?? null,
    secretBox:
      dependencies.paymentSecretKey === undefined
        ? null
        : webhookSecretBox(dependencies.paymentSecretKey),
  };
  registerPaymentWebhookRoute(app, context, payments);
  registerPaymentBackofficeRoutes(app, context, payments);
  registerWalletNoticeRoute(app, context, payments);
  registerWalletPaymentRoute(app, context, payments);
  registerWalletAccountRoutes(app, context, payments);
  const pollerOptions = dependencies.walletPoller;
  const box = payments.secretBox;
  if (pollerOptions !== undefined && box !== null) {
    const deps = { pool, clock: resolvedClock, box, wallets: payments.wallets };
    let poller: ReturnType<typeof startWalletPoller> | null = null;
    app.addHook("onReady", async () => {
      poller = startWalletPoller(deps, pollerOptions);
    });
    app.addHook("onClose", async () => {
      await poller?.stop();
    });
  }
  const einvoiceProviders = providersByKey(dependencies.einvoiceProviders ?? []);
  registerEInvoiceProfileRoutes(app, context, einvoiceProviders);
  registerSettingsRoutes(app, context, einvoiceProviders);
  registerDayCloseRoutes(app, context, einvoiceProviders);
  const workerOptions = dependencies.einvoiceWorker;
  if (workerOptions !== undefined) {
    const deps = { pool, clock: resolvedClock, providers: einvoiceProviders, ...workerOptions };
    let worker: ReturnType<typeof startEInvoiceWorker> | null = null;
    app.addHook("onReady", async () => {
      worker = startEInvoiceWorker(deps, workerOptions);
    });
    app.addHook("onClose", async () => {
      await worker?.stop();
    });
  }

  return app;
}
