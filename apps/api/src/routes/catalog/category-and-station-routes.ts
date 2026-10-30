import { categoryBodySchema, stationBodySchema } from "@fnb/contracts";
import type { FastifyInstance } from "fastify";
import type { ApiContext } from "../../api-context";
import { CATALOG_API_ERROR_CODES } from "../../catalog/catalog-api-error-codes";
import { recordCategoryChange, recordStationChange } from "../../catalog/catalog-change-feed";
import { registerStationResumeRoute } from "./station-resume-route";
import { registerVersionedResourceRoutes } from "./versioned-resource-routes";

export function registerCategoryAndStationRoutes(app: FastifyInstance, context: ApiContext): void {
  registerVersionedResourceRoutes(app, context, {
    path: "/catalog/categories",
    table: "category",
    owner: {
      column: "brand_id",
      key: "brandId",
      table: "brand",
      notFoundCode: CATALOG_API_ERROR_CODES.brandNotFound,
    },
    notFoundCode: CATALOG_API_ERROR_CODES.categoryNotFound,
    body: categoryBodySchema,
    ownerOf: (input) => input.brandId,
    cellsOf: (input) => ({ name: input.name, sort_order: input.sortOrder }),
    select: "id, brand_id, name, sort_order, version",
    orderBy: "sort_order, name, id",
    show: (row) => ({
      id: row.id,
      brandId: row.brand_id,
      name: row.name,
      sortOrder: row.sort_order,
      version: row.version,
    }),
    recordChange: recordCategoryChange,
  });

  registerVersionedResourceRoutes(app, context, {
    path: "/catalog/stations",
    table: "station",
    owner: {
      column: "branch_id",
      key: "branchId",
      table: "branch",
      notFoundCode: CATALOG_API_ERROR_CODES.branchNotFound,
    },
    notFoundCode: CATALOG_API_ERROR_CODES.stationNotFound,
    body: stationBodySchema,
    ownerOf: (input) => input.branchId,
    cellsOf: (input) => ({ name: input.name }),
    select: "id, branch_id, name, version, archived_at",
    orderBy: "name, id",
    show: (row) => ({
      id: row.id,
      branchId: row.branch_id,
      name: row.name,
      version: row.version,
      archivedAt: row.archived_at instanceof Date ? row.archived_at.toISOString() : null,
    }),
    recordChange: recordStationChange,
    // A station that printed tickets is archived, not refused; one that a product on the menu
    // still names is neither: that product would print nowhere.
    archivable: {
      inUse: async (client, id) =>
        (
          await client.query(
            "SELECT 1 FROM product WHERE station_id = $1 AND archived_at IS NULL LIMIT 1",
            [id],
          )
        ).rowCount === 1,
    },
  });

  registerStationResumeRoute(app, context);
}
