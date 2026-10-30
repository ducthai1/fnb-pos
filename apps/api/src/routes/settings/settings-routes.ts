import { settingBodySchema, settingParamsSchema, settingsQuerySchema } from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import { isFlagLockedOn } from "@fnb/feature-flags";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ApiContext } from "../../api-context";
import { AUTH_ERROR_CODES } from "../../auth/auth-error-codes";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import { CONFIG_KEY_DEFINITIONS, layerMaySet } from "../../configuration/config-key-definitions";
import { clearConfigValue, saveConfigValue } from "../../configuration/config-value-writes";
import { flagViolationUnder } from "../../configuration/flag-rules-under-scope";
import { readScopeConfig } from "../../configuration/read-scope-config";
import { SETTINGS_ERROR_CODES as CODES } from "../../configuration/settings-error-codes";
import { settingsViewOf } from "../../configuration/settings-view";
import { EINVOICE_ERROR_CODES } from "../../einvoice/einvoice-error-codes";
import type { EInvoiceProvider } from "../../einvoice/einvoice-provider";

/** Answered as is; thrown inside the transaction so a refused write rolls back. */
class SettingsRefusal extends Error {
  constructor(
    readonly status: number,
    readonly body: Record<string, unknown>,
  ) {
    super(String(body.code));
  }
}

const refuse = (status: number, code: string, details?: Record<string, unknown>) =>
  new SettingsRefusal(status, details === undefined ? { code } : { code, details });
const INVALID = () => refuse(400, AUTH_ERROR_CODES.invalidRequest);

/**
 * The switches and settings of a brand, a branch or one till. They decide how the shop
 * prices, takes money and invoices, so reading and changing them take manage_settings,
 * which nobody can lend. A write goes through saveConfigValue/clearConfigValue, which
 * send every till under the scope its settings as they now resolve; a switch write is
 * then judged by the flag rules everywhere under the scope, and refused (rolled back,
 * nothing sent) when it leaves some brand, branch or till with a combination that breaks one.
 */
export function registerSettingsRoutes(
  app: FastifyInstance,
  context: ApiContext,
  einvoiceProviders: ReadonlyMap<string, EInvoiceProvider>,
): void {
  const guard = {
    onRequest: [context.requireSession, context.requirePermission("manage_settings")],
  };
  const answering =
    (work: (request: FastifyRequest) => Promise<unknown>) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        return reply.send(await work(request));
      } catch (error) {
        if (error instanceof SettingsRefusal) return reply.code(error.status).send(error.body);
        throw error;
      }
    };

  app.get(
    "/settings",
    guard,
    answering(async (request) => {
      const query = settingsQuerySchema.safeParse(request.query);
      if (!query.success) throw INVALID();
      const { scope, scopeId } = query.data;
      const found = await withTenant(context.pool, backofficeAuth(request).tenantId, (client) =>
        readScopeConfig(client, scope, scopeId),
      );
      if (found === null) throw refuse(404, CODES.scopeNotFound);
      return settingsViewOf(found);
    }),
  );

  const write = (clearing: boolean) =>
    answering(async (request) => {
      const params = settingParamsSchema.safeParse(request.params);
      if (!params.success) throw INVALID();
      const { scope, scopeId, key } = params.data;
      const definition = CONFIG_KEY_DEFINITIONS.get(key);
      if (definition === undefined) throw refuse(404, CODES.unknownKey);
      if (!layerMaySet(definition, scope)) throw refuse(400, CODES.layerNotAllowed);
      let value: unknown = null;
      if (!clearing) {
        const body = settingBodySchema.safeParse(request.body);
        const parsed = body.success ? definition.value.safeParse(body.data.value) : null;
        if (parsed === null || !parsed.success) throw INVALID();
        value = parsed.data;
        if (value === false && isFlagLockedOn(key)) throw refuse(409, CODES.flagLockedOn);
        const provider = (value as { provider?: unknown } | null)?.provider;
        if (
          key === "einvoice_profile" &&
          value !== null &&
          !einvoiceProviders.has(String(provider))
        ) {
          // A profile naming a provider nobody can reach would queue every sale's invoice forever.
          throw refuse(400, EINVOICE_ERROR_CODES.unknownProvider);
        }
      }
      const { tenantId, appUserId } = backofficeAuth(request);
      return withTenant(context.pool, tenantId, async (client) => {
        if ((await readScopeConfig(client, scope, scopeId)) === null)
          throw refuse(404, CODES.scopeNotFound);
        const writer = { tenantId, appUserId, now: context.clock.now() };
        const target = { scopeKind: scope, scopeId };
        if (clearing) await clearConfigValue(client, writer, target, key);
        else await saveConfigValue(client, writer, target, key, value);
        const after = await readScopeConfig(client, scope, scopeId);
        if (after === null) throw new Error("the scope vanished inside its own write");
        if (definition.kind === "flag") {
          const broken = await flagViolationUnder(client, after);
          if (broken !== null) {
            const { code, ...rule } = broken.violation;
            throw refuse(400, code, {
              ...rule,
              scopeKind: broken.scopeKind,
              scopeId: broken.scopeId,
            });
          }
        }
        return settingsViewOf(after);
      });
    });

  app.put("/settings/:scope/:scopeId/:key", guard, write(false));
  app.delete("/settings/:scope/:scopeId/:key", guard, write(true));
}
