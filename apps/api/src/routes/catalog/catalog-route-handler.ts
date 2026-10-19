import type { FastifyReply, FastifyRequest } from "fastify";
import type { ApiContext } from "../../api-context";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import { replyWithCatalogError } from "../../catalog/catalog-request-error";
import type { CatalogWriteContext } from "../../catalog/catalog-row-writes";

/**
 * Who may call a catalog route. Reading needs only a signed-in member: a shift manager
 * looks up the menu, its prices and what is 86'd without being trusted to change them.
 * Every write needs edit_menu, checked before the request is parsed, so a refusal says
 * nothing about whether the request would have been accepted.
 */
export function catalogGates(context: ApiContext) {
  return {
    read: { onRequest: context.requireSession },
    write: { onRequest: [context.requireSession, context.requirePermission("edit_menu")] },
  };
}

/** A catalog route body; any failure it throws is answered as { code } by one mapping. */
export function catalogHandler(
  work: (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply>,
) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    try {
      return await work(request, reply);
    } catch (error) {
      return replyWithCatalogError(error, reply);
    }
  };
}

/** The signed-in caller as the writer of catalog rows, stamped with the API clock. */
export function writeContextOf(request: FastifyRequest, context: ApiContext): CatalogWriteContext {
  const caller = backofficeAuth(request);
  return { tenantId: caller.tenantId, appUserId: caller.appUserId, now: context.clock.now() };
}
