import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { newId } from "../ids/new-id";

// Append-only evidence: no updated_at or version, since a row is never changed. Staff and
// actor ids carry no foreign key so an audit row is never refused for a missing person.
const appendOnlyColumns = () => ({
  id: uuid("id").primaryKey().$defaultFn(newId),
  tenantId: uuid("tenant_id").notNull(),
  payload: jsonb("payload").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Who approved which sensitive action for whom, on which till. */
export const approvalLog = pgTable("approval_log", {
  ...appendOnlyColumns(),
  actionKey: text("action_key").notNull(),
  requestedByStaffId: uuid("requested_by_staff_id").notNull(),
  approvedByStaffId: uuid("approved_by_staff_id").notNull(),
  deviceId: uuid("device_id").notNull(),
  branchId: uuid("branch_id").notNull(),
});

export const auditLog = pgTable("audit_log", {
  ...appendOnlyColumns(),
  actorKind: text("actor_kind").notNull(),
  /** Null exactly when the actor is the system. */
  actorId: uuid("actor_id"),
  action: text("action").notNull(),
  entityKind: text("entity_kind").notNull(),
  entityId: uuid("entity_id").notNull(),
});

export const auditTables = { approvalLog, auditLog };
