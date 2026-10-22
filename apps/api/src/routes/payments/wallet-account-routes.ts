import { WALLET_KEYS, uuidSchema, walletAccountBodySchema } from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import type { ApiContext } from "../../api-context";
import { AUTH_ERROR_CODES } from "../../auth/auth-error-codes";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import { publishBranchDeviceConfigs } from "../../configuration/config-value-writes";
import {
  PAYMENT_ROUTE_ERROR_CODES as CODES,
  WALLET_ROUTE_ERROR_CODES,
} from "../../payments/payment-error-codes";
import type { PaymentRouteDependencies } from "../../payments/payment-route-dependencies";
import { readWalletAccounts, saveWalletAccount } from "../../payments/wallets/wallet-account-store";

const branchExists = async (client: pg.ClientBase, id: string) =>
  ((await client.query("SELECT 1 FROM branch WHERE id = $1", [id])).rowCount ?? 0) > 0;

/** The wallets this server has an adapter for, in the order tills show them. */
const servedWallets = (payments: PaymentRouteDependencies) =>
  WALLET_KEYS.filter((key) => payments.wallets.has(key));

/**
 * A branch's e-wallets in the backoffice. The keys decide whose money a payment opens
 * into, so reading the list and saving both take manage_settings; keys go in and never
 * come back out (the answer says only whether they are saved). Saving sends every till of
 * the branch its settings again, so a wallet turned on appears in the payment drawer.
 */
export function registerWalletAccountRoutes(
  app: FastifyInstance,
  context: ApiContext,
  payments: PaymentRouteDependencies,
): void {
  const { requireSession, requirePermission } = context;
  const invalid = { code: AUTH_ERROR_CODES.invalidRequest };

  app.get<{ Params: { branchId: string } }>(
    "/payments/wallets/:branchId",
    { onRequest: [requireSession, requirePermission("manage_settings")] },
    async (request, reply) => {
      const { branchId } = request.params;
      if (!uuidSchema.safeParse(branchId).success) return reply.code(400).send(invalid);
      const wallets = servedWallets(payments);
      const saved = await withTenant(context.pool, backofficeAuth(request).tenantId, async (c) =>
        (await branchExists(c, branchId)) ? readWalletAccounts(c, branchId, wallets) : null,
      );
      if (saved === null) return reply.code(404).send({ code: CODES.branchNotFound });
      return reply.send({
        wallets: wallets.map((wallet) => ({
          wallet,
          enabled: saved.get(wallet) ?? false,
          saved: saved.has(wallet),
        })),
      });
    },
  );

  app.put<{ Params: { branchId: string; wallet: string } }>(
    "/payments/wallets/:branchId/:wallet",
    { onRequest: [requireSession, requirePermission("manage_settings")] },
    async (request, reply) => {
      const body = walletAccountBodySchema.safeParse(request.body);
      const { branchId, wallet } = request.params;
      if (!body.success || !uuidSchema.safeParse(branchId).success) {
        return reply.code(400).send(invalid);
      }
      if (!payments.wallets.has(wallet)) {
        return reply.code(404).send({ code: WALLET_ROUTE_ERROR_CODES.unknownWallet });
      }
      const box = payments.secretBox;
      if (box === null) return reply.code(503).send({ code: CODES.notConfigured });
      const { tenantId, appUserId } = backofficeAuth(request);
      const outcome = await withTenant(context.pool, tenantId, async (client) => {
        if (!(await branchExists(client, branchId))) return "missing" as const;
        const account = {
          tenantId,
          branchId,
          wallet,
          enabled: body.data.enabled,
          savedBy: appUserId,
          ...(body.data.credentials === undefined ? {} : { credentials: body.data.credentials }),
        };
        if (!(await saveWalletAccount(client, box, account))) return "no_keys" as const;
        await publishBranchDeviceConfigs(client, tenantId, branchId);
        return "saved" as const;
      });
      if (outcome === "missing") return reply.code(404).send({ code: CODES.branchNotFound });
      if (outcome === "no_keys") {
        return reply.code(409).send({ code: WALLET_ROUTE_ERROR_CODES.keysMissing });
      }
      return reply.code(204).send();
    },
  );
}
