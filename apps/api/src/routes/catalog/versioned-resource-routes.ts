import { catalogIdParamsSchema, catalogIdSchema, expectedVersionQuerySchema } from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
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
import { lockTenantChangeFeed } from "../../sync/change-feed";
import { catalogGates, catalogHandler, writeContextOf } from "./catalog-route-handler";

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
  /** Tells the tills that sell from the owner, in the writer's transaction. */
  recordChange(client: pg.PoolClient, tenantId: string, ownerId: string, id: string): Promise<void>;
}

/**
 * GET list by owner, PUT create-or-replace with a version, DELETE (`?version=` of the row
 * last read) when nothing uses it.
 */
export function registerVersionedResourceRoutes<Input extends { version: number | null }>(
  app: FastifyInstance,
  context: ApiContext,
  resource: VersionedResource<Input>,
): void {
  const { read, write } = catalogGates(context);
  const ownerQuery = z.object({ [resource.owner.key]: catalogIdSchema });
  const readOne = `SELECT ${resource.select} FROM ${resource.table} WHERE id = $1`;

  app.get(
    resource.path,
    read,
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
    write,
    catalogHandler(async (request, reply) => {
      const { id } = parseOrReject(catalogIdParamsSchema, request.params);
      const input = parseOrReject(resource.body, request.body);
      const writer = writeContextOf(request, context);
      const { created, row } = await withTenant(context.pool, writer.tenantId, async (client) => {
        // First, as in a sync command: the feed lock is always taken before any row lock.
        await lockTenantChangeFeed(client, writer.tenantId);
        const saved = await putVersionedRow(client, writer, {
          table: resource.table,
          id,
          expectedVersion: input.version,
          parent: { column: resource.owner.column, value: resource.ownerOf(input) },
          cells: resource.cellsOf(input),
          notFoundCode: resource.notFoundCode,
        });
        await resource.recordChange(client, writer.tenantId, resource.ownerOf(input), id);
        return { created: saved.created, row: (await client.query(readOne, [id])).rows[0] };
      });
      return reply.code(created ? 201 : 200).send(resource.show(row));
    }),
  );

  app.delete(
    `${resource.path}/:id`,
    write,
    catalogHandler(async (request, reply) => {
      const { id } = parseOrReject(catalogIdParamsSchema, request.params);
      const { version } = parseOrReject(expectedVersionQuerySchema, request.query);
      const tenantId = backofficeAuth(request).tenantId;
      const deleted = await withTenant(context.pool, tenantId, async (client) => {
        await lockTenantChangeFeed(client, tenantId);
        // Locked and compared first: removing a row someone else just edited is refused.
        const stored = await client.query<{ version: number }>(
          `SELECT version FROM ${resource.table} WHERE id = $1 FOR UPDATE`,
          [id],
        );
        if (stored.rows[0] !== undefined && stored.rows[0].version !== version) {
          throw new CatalogRequestError(409, CATALOG_API_ERROR_CODES.versionConflict);
        }
        const gone = await client.query<{ owner: string }>(
          `DELETE FROM ${resource.table} WHERE id = $1 RETURNING ${resource.owner.column} AS owner`,
          [id],
        );
        const owner = gone.rows[0]?.owner;
        if (owner !== undefined) await resource.recordChange(client, tenantId, owner, id);
        return gone;
      }).catch((error: unknown) => {
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
