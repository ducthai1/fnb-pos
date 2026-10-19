import { integer, timestamp, uuid } from "drizzle-orm/pg-core";
import { newId } from "../ids/new-id";

/**
 * Columns every tenant table carries. The SQL migrations are the source of truth for the
 * schema (constraints, indexes, row level security); these definitions mirror the columns
 * for typed queries, and an integration test fails if the two drift apart.
 */
export function tenantRowColumns() {
  return {
    id: uuid("id").primaryKey().$defaultFn(newId),
    tenantId: uuid("tenant_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by"),
    version: integer("version").notNull().default(1),
  };
}
