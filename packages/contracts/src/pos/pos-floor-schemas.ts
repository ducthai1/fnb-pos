import { z } from "zod";
import { tableShapeSchema } from "../floor/floor-body-schemas";
import { uuidSchema } from "../primitives/uuid-schema";

/**
 * The branch's floor plan as a till keeps it, so the floor screen draws without the
 * network. Each copy carries its row's version, which orders copies of one row; a change
 * with a null snapshot means the area or table left the floor (archived or deleted).
 * Ids: an area or a table by its own id.
 */
export const FLOOR_AREA_ENTITY = "floor_area";
export const FLOOR_TABLE_ENTITY = "floor_table";

const version = z.number().int().nonnegative();
const count = z.number().int();

export const posFloorAreaSchema = z
  .object({ id: uuidSchema, branchId: uuidSchema, name: z.string(), sortOrder: count, version })
  .strict();

export const posFloorTableSchema = z
  .object({
    id: uuidSchema,
    areaId: uuidSchema,
    name: z.string(),
    x: count,
    y: count,
    width: count,
    height: count,
    shape: tableShapeSchema,
    seats: count,
    sortOrder: count,
    version,
  })
  .strict();

/** The floor plan in a till's bootstrap: what is on the floor now, nothing archived. */
export const posFloorPlanSchema = z
  .object({ areas: z.array(posFloorAreaSchema), tables: z.array(posFloorTableSchema) })
  .strict();

export type PosFloorArea = z.infer<typeof posFloorAreaSchema>;
export type PosFloorTable = z.infer<typeof posFloorTableSchema>;
export type PosFloorPlan = z.infer<typeof posFloorPlanSchema>;
