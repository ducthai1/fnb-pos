import { accessTables } from "./access-tables";
import { tenancyTables } from "./tenancy-tables";

/** Every Drizzle table mirrored from the `public` schema. */
export const allTables = { ...tenancyTables, ...accessTables };
