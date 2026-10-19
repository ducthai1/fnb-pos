import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenantRowColumns } from "./tenant-row-columns";

const at = (name: string) => timestamp(name, { withTimezone: true });

/** Permission keys and limits handed to staff; keys are checked against the catalog later. */
export const role = pgTable("role", {
  ...tenantRowColumns(),
  name: text("name").notNull(),
  permissionKeys: text("permission_keys").array().notNull().default([]),
  thresholds: jsonb("thresholds").notNull().default({}),
  isTemplate: boolean("is_template").notNull().default(false),
});

/** Signs in on a paired till with a PIN; pin_* columns are server-side lockout state. */
export const staff = pgTable("staff", {
  ...tenantRowColumns(),
  displayName: text("display_name").notNull(),
  roleId: uuid("role_id").notNull(),
  pinHash: text("pin_hash").notNull(),
  pinFailedAttempts: integer("pin_failed_attempts").notNull().default(0),
  pinLockedUntil: at("pin_locked_until"),
  active: boolean("active").notNull().default(true),
});

/** The branches a staff member may sign in at. */
export const staffBranch = pgTable("staff_branch", {
  ...tenantRowColumns(),
  staffId: uuid("staff_id").notNull(),
  branchId: uuid("branch_id").notNull(),
});

/** One shift on one till, stored as the SHA-256 of its token. */
export const staffSession = pgTable("staff_session", {
  ...tenantRowColumns(),
  staffId: uuid("staff_id").notNull(),
  deviceId: uuid("device_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: at("expires_at").notNull(),
  revokedAt: at("revoked_at"),
});

export const staffTables = { role, staff, staffBranch, staffSession };
