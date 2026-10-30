import { integer, pgTable, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
  sortOrder: integer("sort_order").notNull().default(0),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

/** Archived, never deleted, once an order sat at it; see 0017_floor_plan_and_table_orders.sql. */
export const diningTable = pgTable("dining_table", {
  ...tenantRowColumns(),
  areaId: uuid("area_id").notNull(),
  name: text("name").notNull(),
  x: integer("x").notNull().default(0),
  y: integer("y").notNull().default(0),
  width: integer("width").notNull().default(80),
  height: integer("height").notNull().default(80),
  shape: text("shape").notNull().default("rectangle"),
  seats: integer("seats").notNull().default(4),
  sortOrder: integer("sort_order").notNull().default(0),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const device = pgTable("device", {
  ...tenantRowColumns(),
  branchId: uuid("branch_id").notNull(),
  name: text("name").notNull(),
  /** The till's place among the branch's tills (1 to 9) for calling numbers; null once revoked. */
  callIndex: smallint("call_index"),
});

export const appUser = pgTable("app_user", {
  ...tenantRowColumns(),
  displayName: text("display_name").notNull(),
});

/** Every table of the tenancy schema, for typed clients and schema checks. */
export const tenancyTables = { organization, brand, branch, area, diningTable, device, appUser };
