import { catalogIdParamsSchema, priceListDocumentSchema } from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import { CATALOG_API_ERROR_CODES } from "../../catalog/catalog-api-error-codes";
import { CatalogRequestError, parseOrReject } from "../../catalog/catalog-request-error";
import { checkPriceListItems } from "../../catalog/price-list-document";
import { readPriceList, writePriceList } from "../../catalog/price-list-store";
import { catalogGates, catalogHandler, writeContextOf } from "./catalog-route-handler";

export function registerPriceListRoutes(app: FastifyInstance, context: ApiContext): void {
  const { read, write } = catalogGates(context);

  app.put(
    "/catalog/price-lists/:id",
    write,
    catalogHandler(async (request, reply) => {
      const { id } = parseOrReject(catalogIdParamsSchema, request.params);
      const input = parseOrReject(priceListDocumentSchema, request.body);
      const items = checkPriceListItems(input);
      const writer = writeContextOf(request, context);
      const { created, document } = await withTenant(
        context.pool,
        writer.tenantId,
        async (client) => {
          const saved = await writePriceList(client, writer, id, input, items);
          return { created: saved.created, document: await readPriceList(client, id) };
        },
      );
      return reply.code(created ? 201 : 200).send(document);
    }),
  );

  app.get(
    "/catalog/price-lists/:id",
    read,
    catalogHandler(async (request, reply) => {
      const { id } = parseOrReject(catalogIdParamsSchema, request.params);
      const document = await withTenant(context.pool, backofficeAuth(request).tenantId, (client) =>
        readPriceList(client, id),
      );
      if (document === null) {
        throw new CatalogRequestError(404, CATALOG_API_ERROR_CODES.priceListNotFound);
      }
      return reply.send(document);
    }),
  );
}
