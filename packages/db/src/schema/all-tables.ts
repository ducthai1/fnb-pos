import { accessTables } from "./access-tables";
import { auditTables } from "./audit-tables";
import { catalogTables } from "./catalog-tables";
import { configurationTables } from "./configuration-tables";
import { kitchenTables } from "./kitchen-tables";
import { orderTables } from "./order-tables";
import { priceListTables } from "./price-list-tables";
import { shiftTables } from "./shift-tables";
import { staffTables } from "./staff-tables";
import { syncTables } from "./sync-tables";
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
  ...orderTables,
  ...shiftTables,
  ...syncTables,
  ...kitchenTables,
};
