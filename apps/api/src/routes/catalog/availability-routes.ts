import { availabilityBodySchema, catalogBranchQuerySchema } from "@fnb/contracts";
import { newId, withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import { CATALOG_API_ERROR_CODES } from "../../catalog/catalog-api-error-codes";
import { CatalogRequestError, parseOrReject } from "../../catalog/catalog-request-error";
import { catalogHandler, writeContextOf } from "./catalog-route-handler";

export function registerAvailabilityRoutes(app: FastifyInstance, context: ApiContext): void {
  const session = { onRequest: context.requireSession };

  // Manual "86": the branch ran out. Putting it back removes the entry for that channel only,
  // so an all-channel entry and a single-channel one are switched independently.
  app.put(
    "/catalog/availability",
    session,
    catalogHandler(async (request, reply) => {
      const body = parseOrReject(availabilityBodySchema, request.body);
      const writer = writeContextOf(request, context);
      const until = body.unavailableUntil === null ? null : new Date(body.unavailableUntil);
      if (until !== null && until.getTime() <= writer.now.getTime()) {
        throw new CatalogRequestError(400, CATALOG_API_ERROR_CODES.unavailableUntilNotInFuture);
      }
      await withTenant(context.pool, writer.tenantId, async (client) => {
        if (body.available) {
          await client.query(
            "DELETE FROM product_availability WHERE product_id = $1 AND branch_id = $2 " +
              "AND channel_key IS NOT DISTINCT FROM $3",
            [body.productId, body.branchId, body.channelKey],
          );
          return;
        }
        await client.query(
          "INSERT INTO product_availability (id, tenant_id, product_id, branch_id, channel_key, " +
            "unavailable_until, created_at, updated_at, created_by) " +
            "VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8) " +
            "ON CONFLICT ON CONSTRAINT product_availability_once DO UPDATE SET " +
            "unavailable_until = EXCLUDED.unavailable_until, updated_at = EXCLUDED.updated_at, " +
            "version = product_availability.version + 1",
          [
            newId(),
            writer.tenantId,
            body.productId,
            body.branchId,
            body.channelKey,
            until,
            writer.now,
            writer.appUserId,
          ],
        );
      });
      return reply.send({ ...body, unavailableUntil: until === null ? null : until.toISOString() });
    }),
  );

  // What is off at a branch right now; an entry past its time no longer counts.
  app.get(
    "/catalog/availability",
    session,
    catalogHandler(async (request, reply) => {
      const { branchId } = parseOrReject(catalogBranchQuerySchema, request.query);
      const now = context.clock.now();
      const rows = await withTenant(
        context.pool,
        backofficeAuth(request).tenantId,
        async (client) => {
          const branch = await client.query("SELECT 1 FROM branch WHERE id = $1", [branchId]);
          if (branch.rowCount === 0) {
            throw new CatalogRequestError(404, CATALOG_API_ERROR_CODES.branchNotFound);
          }
          const result = await client.query<{
            product_id: string;
            channel_key: string | null;
            unavailable_until: Date | null;
          }>(
            "SELECT product_id, channel_key, unavailable_until FROM product_availability " +
              "WHERE branch_id = $1 AND (unavailable_until IS NULL OR unavailable_until > $2) " +
              "ORDER BY product_id, channel_key NULLS FIRST",
            [branchId, now],
          );
          return result.rows;
        },
      );
      return reply.send(
        rows.map((row) => ({
          productId: row.product_id,
          channelKey: row.channel_key,
          unavailableUntil: row.unavailable_until?.toISOString() ?? null,
        })),
      );
    }),
  );
}
