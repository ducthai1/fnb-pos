import { catalogIdParamsSchema, resumeProductBodySchema } from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { backofficeAuth } from "../../auth/backoffice-session-hook";
import { CATALOG_API_ERROR_CODES } from "../../catalog/catalog-api-error-codes";
import { recordStationChange } from "../../catalog/catalog-change-feed";
import { CatalogRequestError, parseOrReject } from "../../catalog/catalog-request-error";
import { lockTenantChangeFeed } from "../../sync/change-feed";
import { catalogGates, catalogHandler } from "./catalog-route-handler";

/**
 * Puts an archived station back in use: listed again, offered to products, and sent to its
 * branch's tills. The caller names the version it saw, as every other write does.
 */
export function registerStationResumeRoute(app: FastifyInstance, context: ApiContext): void {
  const { write } = catalogGates(context);
  app.post(
    "/catalog/stations/:id/unarchive",
    write,
    catalogHandler(async (request, reply) => {
      const { id } = parseOrReject(catalogIdParamsSchema, request.params);
      const { version } = parseOrReject(resumeProductBodySchema, request.body);
      const tenantId = backofficeAuth(request).tenantId;
      const row = await withTenant(context.pool, tenantId, async (client) => {
        await lockTenantChangeFeed(client, tenantId);
        const found = await client.query<{
          version: number;
          branch_id: string;
          archived_at: Date | null;
        }>("SELECT version, branch_id, archived_at FROM station WHERE id = $1 FOR UPDATE", [id]);
        const current = found.rows[0];
        if (current === undefined) {
          throw new CatalogRequestError(404, CATALOG_API_ERROR_CODES.stationNotFound);
        }
        if (current.version !== version) {
          throw new CatalogRequestError(409, CATALOG_API_ERROR_CODES.versionConflict);
        }
        // Already in use: nothing to do, and the tills are told nothing new.
        if (current.archived_at === null) return current;
        await client.query(
          "UPDATE station SET archived_at = NULL, updated_at = $2, version = version + 1 WHERE id = $1",
          [id, context.clock.now()],
        );
        await recordStationChange(client, tenantId, current.branch_id, id);
        return { ...current, version: current.version + 1 };
      });
      return reply.send({ id, version: row.version, archivedAt: null });
    }),
  );
}
