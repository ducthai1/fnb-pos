import { z } from "zod";
import { countSchema, idSchema, nameSchema, versionSchema } from "./catalog-schema-parts";

/** A menu section of a brand ("Trà sữa"), shown in sortOrder. */
export const categoryBodySchema = z
  .object({
    version: versionSchema,
    brandId: idSchema,
    name: nameSchema,
    sortOrder: countSchema.default(0),
  })
  .strict();

/** Where a branch makes things ("Bar"); kitchen tickets are routed by a product's station. */
export const stationBodySchema = z
  .object({ version: versionSchema, branchId: idSchema, name: nameSchema })
  .strict();

export type CategoryBodyInput = z.infer<typeof categoryBodySchema>;
export type StationBodyInput = z.infer<typeof stationBodySchema>;
