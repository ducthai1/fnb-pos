import { accessTables } from "./access-tables";
import { auditTables } from "./audit-tables";
import { configurationTables } from "./configuration-tables";
import { staffTables } from "./staff-tables";
import { tenancyTables } from "./tenancy-tables";

/** Every Drizzle table mirrored from the `public` schema. */
export const allTables = {
  ...tenancyTables,
  ...accessTables,
  ...staffTables,
  ...auditTables,
  ...configurationTables,
};
