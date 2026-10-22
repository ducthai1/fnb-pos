import { uuidSchema } from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import type { ApiContext } from "../../api-context";
import type { GatewayNotice } from "../../payments/gateways/payment-gateway-adapter";
import { PAYMENT_ROUTE_ERROR_CODES as CODES } from "../../payments/payment-error-codes";
import type { PaymentRouteDependencies } from "../../payments/payment-route-dependencies";
import type { WebhookSecretBox } from "../../payments/webhook-secret-box";
import { openWalletAccounts } from "../../payments/wallets/wallet-account-store";
import type {
  WalletGatewayAdapter,
  WalletPaymentReport,
} from "../../payments/wallets/wallet-gateway-adapter";
import {
  pendingWalletIntent,
  settleWalletPayment,
} from "../../payments/wallets/wallet-payment-settlement";

interface NoticeParams {
  wallet: string;
  tenantRoute: string;
}

/**
 * The branch whose wallet keys prove the notice, with what it reports. The pending intent
 * the notice names, if any, says which branch's keys to try; otherwise every branch's are
 * tried, so a payment for an intent that is gone is still proven and kept for a person.
 */
async function provenNotice(
  client: pg.ClientBase,
  box: WebhookSecretBox,
  tenantId: string,
  adapter: WalletGatewayAdapter,
  notice: GatewayNotice,
): Promise<{ branchId: string; report: WalletPaymentReport } | null> {
  const ref = adapter.claimedRef(notice);
  const intent = ref === null ? null : await pendingWalletIntent(client, adapter.wallet, ref, false);
  const accounts = await openWalletAccounts(
    client,
    box,
    tenantId,
    adapter.wallet,
    intent?.branchId ?? null,
  );
  for (const account of accounts) {
    const report = adapter.verifyNotice(account.credentials, notice);
    if (report !== null) return { branchId: account.branchId, report };
  }
  return null;
}

/**
 * Where an e-wallet reports a payment (ZaloPay's callback). The path names the shop, as a
 * claim only: the notice must be signed with a key of one of the shop's branches, and the
 * same refusal goes to anything unproven whether the shop exists or not. A proven notice
 * is answered as taken, a repeated one too, so the wallet stops sending it.
 */
export function registerWalletNoticeRoute(
  app: FastifyInstance,
  context: ApiContext,
  payments: PaymentRouteDependencies,
): void {
  app.post<{ Params: NoticeParams }>(
    "/webhooks/wallets/:wallet/:tenantRoute",
    async (request, reply) => {
      const adapter = payments.wallets.get(request.params.wallet);
      if (adapter === undefined) return reply.code(404).send({ code: CODES.unknownGateway });
      const box = payments.secretBox;
      if (box === null) return reply.code(503).send({ code: CODES.notConfigured });
      const tenantId = request.params.tenantRoute;
      if (!uuidSchema.safeParse(tenantId).success) {
        return reply.code(401).send(adapter.noticeAnswer("refused"));
      }
      const notice = { headers: request.headers, body: request.body };
      const proven = await withTenant(context.pool, tenantId, async (client) => {
        const found = await provenNotice(client, box, tenantId, adapter, notice);
        if (found === null) return false;
        await settleWalletPayment(client, {
          tenantId,
          branchId: found.branchId,
          wallet: adapter.wallet,
          report: found.report,
          heardBy: "callback",
          raw: notice.body,
          receivedAt: context.clock.now(),
        });
        return true;
      });
      if (!proven) return reply.code(401).send(adapter.noticeAnswer("refused"));
      return reply.code(200).send(adapter.noticeAnswer("accepted"));
    },
  );
}
