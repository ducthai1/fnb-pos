import type { FastifyReply, FastifyRequest } from "fastify";
import type { ApiContext } from "../../api-context";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import { replyWithCatalogError } from "../../catalog/catalog-request-error";
import type { CatalogWriteContext } from "../../catalog/catalog-row-writes";

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
