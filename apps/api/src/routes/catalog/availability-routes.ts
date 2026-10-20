import { availabilityBodySchema, catalogBranchQuerySchema } from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import { saveAvailability } from "../../catalog/availability-store";
import { CATALOG_API_ERROR_CODES } from "../../catalog/catalog-api-error-codes";
import { CatalogRequestError, parseOrReject } from "../../catalog/catalog-request-error";
import { catalogGates, catalogHandler, writeContextOf } from "./catalog-route-handler";

export function registerAvailabilityRoutes(app: FastifyInstance, context: ApiContext): void {
  const { read, write } = catalogGates(context);

  // Manual "86": the branch ran out, or has it again (saveAvailability).
  app.put(
    "/catalog/availability",
    write,
    catalogHandler(async (request, reply) => {
      const body = parseOrReject(availabilityBodySchema, request.body);
      const writer = writeContextOf(request, context);
      const until = body.unavailableUntil === null ? null : new Date(body.unavailableUntil);
      if (until !== null && until.getTime() <= writer.now.getTime()) {
        throw new CatalogRequestError(400, CATALOG_API_ERROR_CODES.unavailableUntilNotInFuture);
      }
      await withTenant(context.pool, writer.tenantId, (client) =>
        saveAvailability(client, writer, body, until),
      );
      return reply.send({ ...body, unavailableUntil: until === null ? null : until.toISOString() });
    }),
  );

  // What is off at a branch right now; an entry past its time no longer counts.
  app.get(
    "/catalog/availability",
    read,
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
