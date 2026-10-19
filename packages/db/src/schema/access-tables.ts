import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { tenantRowColumns } from "./tenant-row-columns";

/**
 * Tenant-side half of sign-in: which global account acts as which app_user of the
 * organization. The accounts themselves live outside `public`, out of the app role's reach.
 */
export const membership = pgTable("membership", {
  ...tenantRowColumns(),
  accountId: uuid("account_id").notNull(),
  appUserId: uuid("app_user_id").notNull(),
  /** "active" or "suspended"; a suspended member's sessions stop working at once. */
  status: text("status").notNull().default("active"),
});

/** Every table of the access schema, for typed clients and schema checks. */
export const accessTables = { membership };
