import {
  matchPaymentBodySchema,
  unmatchedPaymentsQuerySchema,
  uuidSchema,
  webhookSecretBodySchema,
} from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import type { ApiContext } from "../../api-context";
import { AUTH_ERROR_CODES } from "../../auth/auth-error-codes";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import { PAYMENT_ROUTE_ERROR_CODES as CODES } from "../../payments/payment-error-codes";
import { paymentIntentSnapshotOf } from "../../payments/payment-intent-store";
import type { PaymentRouteDependencies } from "../../payments/payment-route-dependencies";
import { matchTransferByHand } from "../../payments/match-transfer-by-hand";
import { readUnmatchedPayments } from "../../payments/unmatched-payments-query";
import { saveWebhookSecret } from "../../payments/webhook-endpoint-store";

/** Another tenant's branches are invisible under row level security, so they read as missing. */
const branchExists = async (client: pg.ClientBase, id: string) =>
  ((await client.query("SELECT 1 FROM branch WHERE id = $1", [id])).rowCount ?? 0) > 0;

/**
 * The backoffice side of QR payments. Listing what is unmatched shows the shop's money, so
 * it takes view_reports. Matching by hand decides which order a customer's money paid, and
 * setting a gateway secret decides whose notices count as money: both are a manager's call
 * and take manage_settings (matching also view_reports, as it acts on what the list shows).
 * Neither key can be lent on the spot.
 */
export function registerPaymentBackofficeRoutes(
  app: FastifyInstance,
  context: ApiContext,
  payments: PaymentRouteDependencies,
): void {
  const { requireSession, requirePermission } = context;
  const invalid = { code: AUTH_ERROR_CODES.invalidRequest };

  app.get(
    "/payments/unmatched",
    { onRequest: [requireSession, requirePermission("view_reports")] },
    async (request, reply) => {
      const query = unmatchedPaymentsQuerySchema.safeParse(request.query);
      if (!query.success) return reply.code(400).send(invalid);
      const answer = await withTenant(context.pool, backofficeAuth(request).tenantId, async (c) =>
        (await branchExists(c, query.data.branchId))
          ? readUnmatchedPayments(c, query.data.branchId)
          : null,
      );
      if (answer === null) return reply.code(404).send({ code: CODES.branchNotFound });
      return reply.send(answer);
    },
  );

  app.post(
    "/payments/match",
    {
      onRequest: [
        requireSession,
        requirePermission("view_reports"),
        requirePermission("manage_settings"),
      ],
    },
    async (request, reply) => {
      const body = matchPaymentBodySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send(invalid);
      const { tenantId, appUserId } = backofficeAuth(request);
      const outcome = await withTenant(context.pool, tenantId, (client) =>
        matchTransferByHand(client, { tenantId, appUserId, ...body.data }),
      );
      if (!outcome.ok) return reply.code(outcome.status).send({ code: outcome.code });
      return reply.send({ intent: paymentIntentSnapshotOf(outcome.intent) });
    },
  );

  app.put<{ Params: { branchId: string; gateway: string } }>(
    "/payments/webhook-secrets/:branchId/:gateway",
    { onRequest: [requireSession, requirePermission("manage_settings")] },
    async (request, reply) => {
      const body = webhookSecretBodySchema.safeParse(request.body);
      const { branchId, gateway } = request.params;
      if (!body.success || !uuidSchema.safeParse(branchId).success) {
        return reply.code(400).send(invalid);
      }
      if (!payments.gateways.has(gateway))
        return reply.code(404).send({ code: CODES.unknownGateway });
      const box = payments.secretBox;
      if (box === null) return reply.code(503).send({ code: CODES.notConfigured });
      const { tenantId, appUserId } = backofficeAuth(request);
      const saved = await withTenant(context.pool, tenantId, async (client) => {
        if (!(await branchExists(client, branchId))) return false;
        const endpoint = {
          tenantId,
          branchId,
          gateway,
          secret: body.data.secret,
          savedBy: appUserId,
        };
        await saveWebhookSecret(client, box, endpoint);
        return true;
      });
      if (!saved) return reply.code(404).send({ code: CODES.branchNotFound });
      return reply.code(204).send();
    },
  );
}
