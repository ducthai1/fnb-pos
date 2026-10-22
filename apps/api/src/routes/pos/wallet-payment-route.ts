import { walletPaymentBodySchema } from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { AUTH_ERROR_CODES } from "../../auth/auth-error-codes";
import { deviceAuth } from "../../devices/device-auth-hook";
import { PAYMENT_ROUTE_ERROR_CODES } from "../../payments/payment-error-codes";
import type { PaymentRouteDependencies } from "../../payments/payment-route-dependencies";
import { openWalletPayment } from "../../payments/wallets/open-wallet-payment";
import { STAFF_SESSION_HEADER, findCurrentStaffSession } from "../../staff/current-staff-session";
import { STAFF_ERROR_CODES } from "../../staff/staff-error-codes";

/**
 * POST /pos/wallet-payments: a till opens an e-wallet payment for an order (online only:
 * the wallet is asked while the till waits). Like a QR command it needs the till's
 * credential and the staff member signed in at it; the amount is the server's own.
 */
export function registerWalletPaymentRoute(
  app: FastifyInstance,
  context: ApiContext,
  payments: PaymentRouteDependencies,
): void {
  app.post("/pos/wallet-payments", { onRequest: context.requireDevice }, async (request, reply) => {
    const body = walletPaymentBodySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ code: AUTH_ERROR_CODES.invalidRequest });
    const box = payments.secretBox;
    if (box === null) return reply.code(503).send({ code: PAYMENT_ROUTE_ERROR_CODES.notConfigured });
    const device = deviceAuth(request);
    const now = context.clock.now();
    const staff = await withTenant(context.pool, device.tenantId, (client) =>
      findCurrentStaffSession(client, device, request.headers[STAFF_SESSION_HEADER], now),
    );
    if (staff === undefined) return reply.code(401).send({ code: STAFF_ERROR_CODES.sessionInvalid });
    const outcome = await openWalletPayment(
      {
        pool: context.pool,
        box,
        wallets: payments.wallets,
        callbackBase: payments.walletCallbackBase,
      },
      { device, staffId: staff.staffId, body: body.data, now },
    );
    if (!outcome.ok) return reply.code(outcome.status).send({ code: outcome.code });
    return reply.code(201).send(outcome.answer);
  });
}
