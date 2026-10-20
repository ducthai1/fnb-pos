import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { newId } from "../ids/new-id";

const at = (name: string) => timestamp(name, { withTimezone: true });

/** One report of how a till's print job came out; append-only, one row per report. */
export const printJobLog = pgTable("print_job_log", {
  id: uuid("id").primaryKey().$defaultFn(newId),
  tenantId: uuid("tenant_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  deviceId: uuid("device_id").notNull(),
  staffId: uuid("staff_id").notNull(),
  commandId: uuid("command_id").notNull(),
  jobId: uuid("job_id").notNull(),
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  attempts: integer("attempts").notNull(),
  printerKey: text("printer_key").notNull(),
  orderId: uuid("order_id"),
  shiftId: uuid("shift_id"),
  errorCode: text("error_code"),
  occurredAt: at("occurred_at").notNull(),
  payload: jsonb("payload").notNull().default({}),
  createdAt: at("created_at").notNull().defaultNow(),
});

export const printTables = { printJobLog };
