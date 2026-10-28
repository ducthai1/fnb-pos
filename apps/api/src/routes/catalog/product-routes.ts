import {
  catalogBrandQuerySchema,
  catalogIdParamsSchema,
  productDocumentSchema,
} from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import { CATALOG_API_ERROR_CODES } from "../../catalog/catalog-api-error-codes";
import { recordProductChanges } from "../../catalog/catalog-change-feed";
import { CatalogRequestError, parseOrReject } from "../../catalog/catalog-request-error";
import { amountOf } from "../../catalog/product-document";
import { checkProductDocument } from "../../catalog/product-document-to-domain";
import { readProductDocument } from "../../catalog/read-product-document";
import { writeProductDocument } from "../../catalog/write-product-document";
import { MEDIA_API_ERROR_CODES } from "../../media/media-api-error-codes";
import { productImageUrl } from "../../media/product-image-store";
import { lockTenantChangeFeed } from "../../sync/change-feed";
import { catalogGates, catalogHandler, writeContextOf } from "./catalog-route-handler";

export function registerProductRoutes(app: FastifyInstance, context: ApiContext): void {
  const { read, write } = catalogGates(context);

  // Create or replace a whole product in one transaction, under optimistic locking.
  app.put(
    "/catalog/products/:id",
    write,
    catalogHandler(async (request, reply) => {
      const { id } = parseOrReject(catalogIdParamsSchema, request.params);
      const input = parseOrReject(productDocumentSchema, request.body);
      // Checked before the transaction opens: a refused menu never takes a lock.
      const checked = checkProductDocument(id, input);
      const writer = writeContextOf(request, context);
      // A photo is named only once it is in this tenant's own directory: another tenant's
      // name, or one never uploaded, would leave every till with a broken tile.
      const imageKey = input.imageKey ?? null;
      if (imageKey !== null && !(await context.productImages?.has(writer.tenantId, imageKey))) {
        throw new CatalogRequestError(404, MEDIA_API_ERROR_CODES.imageNotFound);
      }
      const { created, document } = await withTenant(
        context.pool,
        writer.tenantId,
        async (client) => {
          const saved = await writeProductDocument(client, writer, input, checked);
          return { created: saved.created, document: await readProductDocument(client, id) };
        },
      );
      return reply.code(created ? 201 : 200).send(document);
    }),
  );

  app.get(
    "/catalog/products/:id",
    read,
    catalogHandler(async (request, reply) => {
      const { id } = parseOrReject(catalogIdParamsSchema, request.params);
      const { tenantId } = backofficeAuth(request);
      const document = await withTenant(context.pool, tenantId, (client) =>
        readProductDocument(client, id),
      );
      if (document === null) {
        throw new CatalogRequestError(404, CATALOG_API_ERROR_CODES.productNotFound);
      }
      return reply.send(document);
    }),
  );

  app.get(
    "/catalog/products",
    read,
    catalogHandler(async (request, reply) => {
      const { brandId } = parseOrReject(catalogBrandQuerySchema, request.query);
      const { tenantId } = backofficeAuth(request);
      const rows = await withTenant(context.pool, tenantId, async (client) => {
        const brand = await client.query("SELECT 1 FROM brand WHERE id = $1", [brandId]);
        if (brand.rowCount === 0) {
          throw new CatalogRequestError(404, CATALOG_API_ERROR_CODES.brandNotFound);
        }
        const products = await client.query(
          "SELECT id, name, kind, category_id, base_price, pricing_mode, measure_unit, version, " +
            "archived_at, tenant_id, image_key " +
            "FROM product WHERE brand_id = $1 ORDER BY name, id",
          [brandId],
        );
        return products.rows;
      });
      return reply.send(
        rows.map((row) => ({
          id: row.id,
          name: row.name,
          kind: row.kind,
          categoryId: row.category_id,
          basePrice: row.base_price === null ? null : amountOf(row.base_price),
          pricingMode: row.pricing_mode,
          measureUnit: row.measure_unit,
          version: row.version,
          archivedAt: row.archived_at === null ? null : row.archived_at.toISOString(),
          imageUrl: row.image_key === null ? null : productImageUrl(row.tenant_id, row.image_key),
        })),
      );
    }),
  );

  // Takes the product off the menu; it is never deleted, as orders keep pointing at it.
  app.post(
    "/catalog/products/:id/archive",
    write,
    catalogHandler(async (request, reply) => {
      const { id } = parseOrReject(catalogIdParamsSchema, request.params);
      const writer = writeContextOf(request, context);
      const row = await withTenant(context.pool, writer.tenantId, async (client) => {
        await lockTenantChangeFeed(client, writer.tenantId);
        const archived = await client.query(
          "UPDATE product SET archived_at = $2, updated_at = $2, version = version + 1 " +
            "WHERE id = $1 AND archived_at IS NULL",
          [id, writer.now],
        );
        // Tills drop it from the menu; archiving it again tells them nothing new.
        if (archived.rowCount === 1) await recordProductChanges(client, writer.tenantId, [id]);
        const result = await client.query<{ version: number; archived_at: Date }>(
          "SELECT version, archived_at FROM product WHERE id = $1",
          [id],
        );
        return result.rows[0];
      });
      if (row === undefined) {
        throw new CatalogRequestError(404, CATALOG_API_ERROR_CODES.productNotFound);
      }
      return reply.send({ id, version: row.version, archivedAt: row.archived_at.toISOString() });
    }),
  );
}
