import {
  catalogIdParamsSchema,
  catalogIdSchema,
  expectedVersionQuerySchema,
  priceListDocumentSchema,
} from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ApiContext } from "../../api-context";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import { CATALOG_API_ERROR_CODES } from "../../catalog/catalog-api-error-codes";
import { CatalogRequestError, parseOrReject } from "../../catalog/catalog-request-error";
import { checkPriceListItems } from "../../catalog/price-list-document";
import { deletePriceList, listPriceLists, readPriceList, writePriceList } from "../../catalog/price-list-store";
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

  app.get(
    "/catalog/price-lists",
    read,
    catalogHandler(async (request, reply) => {
      const { brandId } = parseOrReject(z.object({ brandId: catalogIdSchema }), request.query);
      const lists = await withTenant(context.pool, backofficeAuth(request).tenantId, async (client) => {
        const brand = await client.query("SELECT 1 FROM brand WHERE id = $1", [brandId]);
        if (brand.rowCount === 0) throw new CatalogRequestError(404, CATALOG_API_ERROR_CODES.brandNotFound);
        return listPriceLists(client, brandId);
      });
      return reply.send(lists);
    }),
  );

  app.delete(
    "/catalog/price-lists/:id",
    write,
    catalogHandler(async (request, reply) => {
      const { id } = parseOrReject(catalogIdParamsSchema, request.params);
      const { version } = parseOrReject(expectedVersionQuerySchema, request.query);
      const tenantId = backofficeAuth(request).tenantId;
      const removed = await withTenant(context.pool, tenantId, (client) =>
        deletePriceList(client, tenantId, id, version),
      );
      if (!removed) throw new CatalogRequestError(404, CATALOG_API_ERROR_CODES.priceListNotFound);
      return reply.code(204).send();
    }),
  );
}
