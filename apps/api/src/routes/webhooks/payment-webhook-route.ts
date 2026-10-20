import { uuidSchema } from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import {
  type GatewayNotice,
  type PaymentGatewayAdapter,
  type ReportedTransfer,
  UnreadableNoticeError,
} from "../../payments/gateways/payment-gateway-adapter";
import { PAYMENT_ROUTE_ERROR_CODES as CODES } from "../../payments/payment-error-codes";
import type { PaymentRouteDependencies } from "../../payments/payment-route-dependencies";
import { recordReportedTransfer } from "../../payments/record-reported-transfer";
import { branchProvenBy } from "../../payments/webhook-endpoint-store";

/** The notice's transfer, null when it reports none, "unreadable" when not in the format. */
function transferIn(adapter: PaymentGatewayAdapter, notice: GatewayNotice) {
  try {
    return adapter.parse(notice);
  } catch (error) {
    if (error instanceof UnreadableNoticeError) return "unreadable" as const;
    throw error;
  }
}

interface WebhookParams {
  gateway: string;
  tenantRoute: string;
}

/**
 * Where a payment gateway reports transfers into a shop's accounts. The path names the
 * shop (its tenant id) the way a till's token does, and like the token it is only a claim:
 * the notice must prove itself with a secret one of that shop's branches set, and the
 * secret that does is what names the branch. Anything unproven gets the same 401 whether
 * the shop exists or not. Every notice that proved itself is answered 200 with
 * {success: true}, a repeated one included, since SePay retries anything else.
 */
export function registerPaymentWebhookRoute(
  app: FastifyInstance,
  context: ApiContext,
  payments: PaymentRouteDependencies,
): void {
  app.post<{ Params: WebhookParams }>(
    "/webhooks/payments/:gateway/:tenantRoute",
    async (request, reply) => {
      const adapter = payments.gateways.get(request.params.gateway);
      if (adapter === undefined) return reply.code(404).send({ code: CODES.unknownGateway });
      const box = payments.secretBox;
      if (box === null) return reply.code(503).send({ code: CODES.notConfigured });
      const tenantId = request.params.tenantRoute;
      if (!uuidSchema.safeParse(tenantId).success) {
        return reply.code(401).send({ code: CODES.notAuthenticated });
      }
      const notice = { headers: request.headers, body: request.body };
      const outcome = await withTenant(context.pool, tenantId, async (client) => {
        const branchId = await branchProvenBy(client, box, tenantId, adapter.gateway, (secret) =>
          adapter.verify(notice, secret),
        );
        if (branchId === null) return "unproven" as const;
        const transfer: ReportedTransfer | "unreadable" | null = transferIn(adapter, notice);
        if (transfer === "unreadable" || transfer === null) return transfer ?? "no_transfer";
        const { gateway } = adapter;
        const receivedAt = context.clock.now();
        const report = { tenantId, branchId, gateway, transfer, raw: notice.body, receivedAt };
        await recordReportedTransfer(client, report);
        return "recorded" as const;
      });
      if (outcome === "unproven") return reply.code(401).send({ code: CODES.notAuthenticated });
      if (outcome === "unreadable") return reply.code(400).send({ code: CODES.unreadableNotice });
      return reply.code(200).send({ success: true });
    },
  );
}
