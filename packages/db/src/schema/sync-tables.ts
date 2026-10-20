import { sql } from "drizzle-orm";
import { bigint, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { newId } from "../ids/new-id";
import { tenantRowColumns } from "./tenant-row-columns";

const at = (name: string) => timestamp(name, { withTimezone: true });

/** Append-only like the audit trail, so it carries neither updated_at nor version. */
export const appliedCommand = pgTable("applied_command", {
  id: uuid("id").primaryKey().$defaultFn(newId),
  tenantId: uuid("tenant_id").notNull(),
  deviceId: uuid("device_id").notNull(),
  /** Who was signed in on the till; null on commands recorded before it was kept. */
  staffId: uuid("staff_id"),
  commandId: uuid("command_id").notNull(),
  deviceSeq: bigint("device_seq", { mode: "number" }).notNull(),
  type: text("type").notNull(),
  status: text("status").notNull(),
  code: text("code"),
  payload: jsonb("payload").notNull().default({}),
  result: jsonb("result").notNull(),
  createdAt: at("created_at").notNull().defaultNow(),
});

export const deviceSyncState = pgTable("device_sync_state", {
  ...tenantRowColumns(),
  deviceId: uuid("device_id").notNull(),
  lastSeq: bigint("last_seq", { mode: "number" }).notNull(),
});

/**
 * change_seq is a bigserial in the database; declared as a bigint drawing from its sequence
 * because bigint is the column type Postgres reports. Write it only through the change feed,
 * which holds the tenant's lock while the number is drawn.
 */
export const changeLog = pgTable("change_log", {
  id: uuid("id").primaryKey().$defaultFn(newId),
  tenantId: uuid("tenant_id").notNull(),
  changeSeq: bigint("change_seq", { mode: "bigint" })
    .notNull()
    .default(sql`nextval('change_log_change_seq_seq')`),
  branchId: uuid("branch_id").notNull(),
  entity: text("entity").notNull(),
  entityId: uuid("entity_id").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  commandId: uuid("command_id"),
  createdAt: at("created_at").notNull().defaultNow(),
});

export const syncTables = { appliedCommand, deviceSyncState, changeLog };
