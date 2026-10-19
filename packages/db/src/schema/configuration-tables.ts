import { sql } from "drizzle-orm";
import { jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { tenantRowColumns } from "./tenant-row-columns";

const scopeIdWhen = (kind: "brand" | "branch" | "device") =>
  sql.raw(`CASE WHEN scope_kind = '${kind}' THEN scope_id END`);

/** One setting a brand, branch or device changed; unset settings inherit. */
export const configValue = pgTable("config_value", {
  ...tenantRowColumns(),
  scopeKind: text("scope_kind").notNull(),
  scopeId: uuid("scope_id").notNull(),
  key: text("key").notNull(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by"),
  /** Derived from scope_kind/scope_id by the database, only to carry the foreign keys. */
  brandId: uuid("brand_id").generatedAlwaysAs(scopeIdWhen("brand")),
  branchId: uuid("branch_id").generatedAlwaysAs(scopeIdWhen("branch")),
  deviceId: uuid("device_id").generatedAlwaysAs(scopeIdWhen("device")),
});

export const configurationTables = { configValue };
