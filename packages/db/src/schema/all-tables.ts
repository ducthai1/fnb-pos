import { accessTables } from "./access-tables";
import { staffTables } from "./staff-tables";
import { tenancyTables } from "./tenancy-tables";

/** Every Drizzle table mirrored from the `public` schema. */
export const allTables = { ...tenancyTables, ...accessTables, ...staffTables };
