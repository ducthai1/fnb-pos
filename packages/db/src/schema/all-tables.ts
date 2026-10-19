import { accessTables } from "./access-tables";
import { auditTables } from "./audit-tables";
import { catalogTables } from "./catalog-tables";
import { configurationTables } from "./configuration-tables";
import { priceListTables } from "./price-list-tables";
import { staffTables } from "./staff-tables";
import { tenancyTables } from "./tenancy-tables";

/** Every Drizzle table mirrored from the `public` schema. */
export const allTables = {
  ...tenancyTables,
  ...accessTables,
  ...staffTables,
  ...auditTables,
  ...configurationTables,
  ...catalogTables,
  ...priceListTables,
};
