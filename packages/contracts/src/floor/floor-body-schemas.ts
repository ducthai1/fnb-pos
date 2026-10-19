import { z } from "zod";
import { uuidSchema } from "../primitives/uuid-schema";

/*
 * The floor plan as the backoffice edits it. A write carries the version it was based on
 * (null to create), so two managers rearranging the plan at once cannot silently undo
 * each other: the second save is refused and re-reads.
 */

const versionSchema = z.number().int().positive().nullable();
const sortOrderSchema = z.number().int().min(0).max(9_999).default(0);

/** Bounds of the floor editor's own units; the POS scales the plan to its screen. */
export const FLOOR_PLAN_EXTENT = 10_000;
const coordinateSchema = z.number().int().min(0).max(FLOOR_PLAN_EXTENT);
const lengthSchema = z.number().int().min(1).max(2_000);

/** A room or zone of a branch ("Tầng 1", "Sân vườn"). */
export const areaBodySchema = z
  .object({
    version: versionSchema,
    branchId: uuidSchema,
    name: z.string().trim().min(1).max(60),
    sortOrder: sortOrderSchema,
  })
  .strict();

export const tableShapeSchema = z.enum(["rectangle", "circle"]);

/** A table of an area, where it stands on the plan and how many it seats. */
export const diningTableBodySchema = z
  .object({
    version: versionSchema,
    areaId: uuidSchema,
    name: z.string().trim().min(1).max(40),
    x: coordinateSchema,
    y: coordinateSchema,
    width: lengthSchema,
    height: lengthSchema,
    shape: tableShapeSchema,
    seats: z.number().int().min(1).max(99),
    sortOrder: sortOrderSchema,
  })
  .strict();

export const floorBranchQuerySchema = z.object({ branchId: uuidSchema }).strict();
export const floorIdParamsSchema = z.object({ id: uuidSchema }).strict();

export type AreaBodyInput = z.infer<typeof areaBodySchema>;
export type DiningTableBodyInput = z.infer<typeof diningTableBodySchema>;
