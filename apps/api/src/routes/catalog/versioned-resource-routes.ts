import { catalogIdParamsSchema, catalogIdSchema } from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ZodType, ZodTypeDef } from "zod";
import { z } from "zod";
import type { ApiContext } from "../../api-context";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import { CATALOG_API_ERROR_CODES } from "../../catalog/catalog-api-error-codes";
import {
  CatalogRequestError,
  isForeignKeyViolation,
  parseOrReject,
} from "../../catalog/catalog-request-error";
import { putVersionedRow } from "../../catalog/catalog-row-writes";
import { catalogHandler, writeContextOf } from "./catalog-route-handler";

/** A flat catalog row owned by a brand or a branch: categories and stations. */
export interface VersionedResource<Input extends { version: number | null }> {
  path: string;
  table: string;
  /** The owner: its column, its query parameter and table, and the 404 when it is missing. */
  owner: { column: string; key: string; table: string; notFoundCode: string };
  notFoundCode: string;
  body: ZodType<Input, ZodTypeDef, unknown>;
  ownerOf(input: Input): string;
  cellsOf(input: Input): Record<string, unknown>;
  /** Columns returned, in SQL, and how a row is shown. */
  select: string;
  orderBy: string;
  show(row: Record<string, unknown>): Record<string, unknown>;
}

/** GET list by owner, PUT create-or-replace with a version, DELETE when nothing uses it. */
export function registerVersionedResourceRoutes<Input extends { version: number | null }>(
  app: FastifyInstance,
  context: ApiContext,
  resource: VersionedResource<Input>,
): void {
  const session = { onRequest: context.requireSession };
  const ownerQuery = z.object({ [resource.owner.key]: catalogIdSchema });
  const readOne = `SELECT ${resource.select} FROM ${resource.table} WHERE id = $1`;

  app.get(
    resource.path,
    session,
    catalogHandler(async (request, reply) => {
      const ownerId = String(parseOrReject(ownerQuery, request.query)[resource.owner.key]);
      const rows = await withTenant(
        context.pool,
        backofficeAuth(request).tenantId,
        async (client) => {
          const owner = await client.query(`SELECT 1 FROM ${resource.owner.table} WHERE id = $1`, [
            ownerId,
          ]);
          if (owner.rowCount === 0) throw new CatalogRequestError(404, resource.owner.notFoundCode);
          const result = await client.query(
            `SELECT ${resource.select} FROM ${resource.table} ` +
              `WHERE ${resource.owner.column} = $1 ORDER BY ${resource.orderBy}`,
            [ownerId],
          );
          return result.rows;
        },
      );
      return reply.send(rows.map(resource.show));
    }),
  );

  app.put(
    `${resource.path}/:id`,
    session,
    catalogHandler(async (request, reply) => {
      const { id } = parseOrReject(catalogIdParamsSchema, request.params);
      const input = parseOrReject(resource.body, request.body);
      const writer = writeContextOf(request, context);
      const { created, row } = await withTenant(context.pool, writer.tenantId, async (client) => {
        const saved = await putVersionedRow(client, writer, {
          table: resource.table,
          id,
          expectedVersion: input.version,
          parent: { column: resource.owner.column, value: resource.ownerOf(input) },
          cells: resource.cellsOf(input),
          notFoundCode: resource.notFoundCode,
        });
        return { created: saved.created, row: (await client.query(readOne, [id])).rows[0] };
      });
      return reply.code(created ? 201 : 200).send(resource.show(row));
    }),
  );

  app.delete(
    `${resource.path}/:id`,
    session,
    catalogHandler(async (request, reply) => {
      const { id } = parseOrReject(catalogIdParamsSchema, request.params);
      const tenantId = backofficeAuth(request).tenantId;
      const deleted = await withTenant(context.pool, tenantId, (client) =>
        client.query(`DELETE FROM ${resource.table} WHERE id = $1`, [id]),
      ).catch((error: unknown) => {
        // Still named by a product or price list item: those must move first.
        if (isForeignKeyViolation(error)) {
          throw new CatalogRequestError(409, CATALOG_API_ERROR_CODES.inUse);
        }
        throw error;
      });
      if (deleted.rowCount === 0) throw new CatalogRequestError(404, resource.notFoundCode);
      return reply.code(204).send();
    }),
  );
}
