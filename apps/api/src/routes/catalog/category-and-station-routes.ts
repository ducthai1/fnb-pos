import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ApiContext } from "../../api-context";
import { CATALOG_API_ERROR_CODES } from "../../catalog/catalog-api-error-codes";
import {
  countSchema,
  idSchema,
  nameSchema,
  versionSchema,
} from "../../catalog/catalog-schema-parts";
import { registerVersionedResourceRoutes } from "./versioned-resource-routes";

const categoryBody = z
  .object({
    version: versionSchema,
    brandId: idSchema,
    name: nameSchema,
    sortOrder: countSchema.default(0),
  })
  .strict();

const stationBody = z
  .object({ version: versionSchema, branchId: idSchema, name: nameSchema })
  .strict();

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
    body: categoryBody,
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
  });

  // Where a branch makes things; kitchen tickets are routed by a product's station.
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
    body: stationBody,
    ownerOf: (input) => input.branchId,
    cellsOf: (input) => ({ name: input.name }),
    select: "id, branch_id, name, version",
    orderBy: "name, id",
    show: (row) => ({ id: row.id, branchId: row.branch_id, name: row.name, version: row.version }),
  });
}
