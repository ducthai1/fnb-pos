import { einvoiceProfileSchema } from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { AUTH_ERROR_CODES } from "../../auth/auth-error-codes";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import { saveConfigValue } from "../../configuration/config-value-writes";
import {
  EINVOICE_PROFILE_KEY,
  readBranchEInvoiceProfile,
} from "../../einvoice/branch-einvoice-profile";
import { EINVOICE_ERROR_CODES as CODES } from "../../einvoice/einvoice-error-codes";
import type { EInvoiceProvider } from "../../einvoice/einvoice-provider";
import { uuidJsonSchema } from "../../http/uuid-schema";

const params = {
  type: "object",
  required: ["branchId"],
  properties: { branchId: uuidJsonSchema },
} as const;

/**
 * A branch's invoicing profile. It decides in whose name and through which provider every
 * sale is invoiced, so reading and changing it take manage_settings, which nobody can lend.
 * It is saved at the branch: each branch is a seller with its own address and template.
 */
export function registerEInvoiceProfileRoutes(
  app: FastifyInstance,
  context: ApiContext,
  providers: ReadonlyMap<string, EInvoiceProvider>,
): void {
  const guard = [context.requireSession, context.requirePermission("manage_settings")];

  app.get<{ Params: { branchId: string } }>(
    "/branches/:branchId/einvoice-profile",
    { onRequest: guard, schema: { params } },
    async (request, reply) => {
      const { tenantId } = backofficeAuth(request);
      const found = await withTenant(context.pool, tenantId, (client) =>
        readBranchEInvoiceProfile(client, request.params.branchId),
      );
      if (found === null) return reply.code(404).send({ code: CODES.branchNotFound });
      return {
        status: found.status,
        source: found.source,
        profile: found.status === "set" ? found.profile : null,
      };
    },
  );

  app.put<{ Params: { branchId: string } }>(
    "/branches/:branchId/einvoice-profile",
    { onRequest: guard, schema: { params } },
    async (request, reply) => {
      const body = einvoiceProfileSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ code: AUTH_ERROR_CODES.invalidRequest });
      // A profile naming a provider nobody can reach would queue every sale's invoice forever.
      if (!providers.has(body.data.provider)) {
        return reply.code(400).send({ code: CODES.unknownProvider });
      }
      const { tenantId, appUserId } = backofficeAuth(request);
      const { branchId } = request.params;
      const saved = await withTenant(context.pool, tenantId, async (client) => {
        const branch = await client.query("SELECT 1 FROM branch WHERE id = $1", [branchId]);
        if (branch.rowCount === 0) return false;
        const write = { tenantId, appUserId, now: context.clock.now() };
        const scope = { scopeKind: "branch" as const, scopeId: branchId };
        await saveConfigValue(client, write, scope, EINVOICE_PROFILE_KEY, body.data);
        return true;
      });
      if (!saved) return reply.code(404).send({ code: CODES.branchNotFound });
      return { profile: body.data };
    },
  );
}
