import { integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { tenantRowColumns } from "./tenant-row-columns";

/** The tenant root: an organization's tenant_id is its own id. */
export const organization = pgTable("organization", {
  ...tenantRowColumns(),
  name: text("name").notNull(),
});

export const brand = pgTable("brand", {
  ...tenantRowColumns(),
  name: text("name").notNull(),
});

export const branch = pgTable("branch", {
  ...tenantRowColumns(),
  brandId: uuid("brand_id").notNull(),
  name: text("name").notNull(),
  /** Fixed offset, not a zone name: Vietnam is UTC+7 all year. */
  utcOffsetMinutes: integer("utc_offset_minutes").notNull().default(420),
  /** Minute of the local day at which the business day rolls over (default 04:00). */
  businessDayStartMinute: integer("business_day_start_minute").notNull().default(240),
});

export const area = pgTable("area", {
  ...tenantRowColumns(),
  branchId: uuid("branch_id").notNull(),
  name: text("name").notNull(),
});

export const diningTable = pgTable("dining_table", {
  ...tenantRowColumns(),
  areaId: uuid("area_id").notNull(),
  name: text("name").notNull(),
});

export const device = pgTable("device", {
  ...tenantRowColumns(),
  branchId: uuid("branch_id").notNull(),
  name: text("name").notNull(),
});

export const appUser = pgTable("app_user", {
  ...tenantRowColumns(),
  displayName: text("display_name").notNull(),
});

/** Every table of the tenancy schema, for typed clients and schema checks. */
export const tenancyTables = { organization, brand, branch, area, diningTable, device, appUser };
