import { clientErrorBatchSchema } from "@fnb/contracts";
import type { FastifyInstance, onRequestAsyncHookHandler } from "fastify";
import type { ApiContext } from "../../api-context";
import { AUTH_ERROR_CODES } from "../../auth/auth-error-codes";
import {
  type ClientErrorEntry,
  type ClientErrorSource,
} from "../../client-errors/client-error-log";
import { scrubClientError } from "../../client-errors/scrub-client-error";

/** Whoever is calling, a till or a signed-in backoffice member; ids only. */
function sourceOf(request: Parameters<onRequestAsyncHookHandler>[0]): ClientErrorSource {
  if (request.device !== null) {
    return {
      tenantId: request.device.tenantId,
      deviceId: request.device.deviceId,
      accountId: null,
    };
  }
  if (request.auth === null) throw new Error("route is missing an authentication hook");
  return { tenantId: request.auth.tenantId, deviceId: null, accountId: request.auth.accountId };
}

/**
 * POST /client-errors: the faults the POS and the backoffice hit on a screen, a batch at a
 * time. Open to a paired till (its credential) and to a signed-in member (the session
 * cookie), nobody else. Answers 204 to anything well formed, so a client that is told "ok"
 * never retries: what the server cannot log it drops.
 */
export function registerClientErrorRoute(
  app: FastifyInstance,
  context: ApiContext,
  onClientError: ((entry: ClientErrorEntry) => void) | undefined,
): void {
  // The two hooks are the async ones deviceAuthHook and backofficeSessionHook return.
  const requireDevice = context.requireDevice as onRequestAsyncHookHandler;
  const requireSession = context.requireSession as onRequestAsyncHookHandler;
  const requireCaller: onRequestAsyncHookHandler = function (request, reply) {
    const isTill = (request.headers.authorization ?? "").startsWith("Device ");
    return (isTill ? requireDevice : requireSession).call(this, request, reply);
  };

  app.post("/client-errors", { onRequest: requireCaller }, async (request, reply) => {
    const parsed = clientErrorBatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ code: AUTH_ERROR_CODES.invalidRequest });
    const source = sourceOf(request);
    for (const report of parsed.data.reports) {
      try {
        onClientError?.({ source, report: scrubClientError(report) });
      } catch {
        // A log that fails must not turn a report into an error the client would retry.
      }
    }
    return reply.code(204).send();
  });
}
