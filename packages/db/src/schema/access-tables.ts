import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenantRowColumns } from "./tenant-row-columns";

const at = (name: string) => timestamp(name, { withTimezone: true });

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

/** A short code a manager hands to a new till; single use, stored as its SHA-256 only. */
export const devicePairingCode = pgTable("device_pairing_code", {
  ...tenantRowColumns(),
  branchId: uuid("branch_id").notNull(),
  codeHash: text("code_hash").notNull(),
  createdByAppUserId: uuid("created_by_app_user_id").notNull(),
  expiresAt: at("expires_at").notNull(),
  usedAt: at("used_at"),
});

/** A till's bearer credential, stored as the SHA-256 of the token it was shown once. */
export const deviceCredential = pgTable("device_credential", {
  ...tenantRowColumns(),
  deviceId: uuid("device_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  revokedAt: at("revoked_at"),
});

/** Every table of the access schema, for typed clients and schema checks. */
export const accessTables = { membership, devicePairingCode, deviceCredential };
