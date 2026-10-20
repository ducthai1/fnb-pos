import { date, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenantRowColumns } from "./tenant-row-columns";

const at = (name: string) => timestamp(name, { withTimezone: true });

/** One invoice per paid sale (or adjusting refund); see 0019_einvoice.sql. */
export const einvoice = pgTable("einvoice", {
  ...tenantRowColumns(),
  orderId: uuid("order_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  businessDate: date("business_date").notNull(),
  kind: text("kind").notNull().default("sale"),
  adjustsEinvoiceId: uuid("adjusts_einvoice_id"),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: at("next_attempt_at"),
  lastErrorCode: text("last_error_code"),
  provider: text("provider").notNull(),
  regimeVersion: text("regime_version").notNull(),
  templateSymbol: text("template_symbol").notNull(),
  seller: jsonb("seller").notNull(),
  buyer: jsonb("buyer"),
  soldAt: at("sold_at").notNull(),
  /** What the till's clock showed at the sale, and when the server received it; see 0024. */
  soldAtDevice: at("sold_at_device"),
  soldReceivedAt: at("sold_received_at"),
  amounts: jsonb("amounts").notNull(),
  number: text("number"),
  taxAuthorityCode: text("tax_authority_code"),
  lookupCode: text("lookup_code"),
  lookupUrl: text("lookup_url"),
  issuedAt: at("issued_at"),
  /** The day's batch the invoice was sent on in; see 0020_day_close.sql. */
  batchId: uuid("batch_id"),
});

/** A branch's issued invoices of one business day, sent on as the regime asks. */
export const einvoiceDailyBatch = pgTable("einvoice_daily_batch", {
  ...tenantRowColumns(),
  branchId: uuid("branch_id").notNull(),
  businessDate: date("business_date").notNull(),
  provider: text("provider").notNull(),
  regimeVersion: text("regime_version").notNull(),
  seller: jsonb("seller").notNull(),
  invoiceCount: integer("invoice_count").notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: at("next_attempt_at"),
  lastErrorCode: text("last_error_code"),
  reference: text("reference"),
  submittedAt: at("submitted_at"),
});

/** A closed business day of a branch; append-only. */
export const dayClose = pgTable("day_close", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  businessDate: date("business_date").notNull(),
  closedByAppUserId: uuid("closed_by_app_user_id").notNull(),
  closedAt: at("closed_at").notNull(),
  summary: jsonb("summary").notNull(),
  createdAt: at("created_at").notNull().defaultNow(),
});

export const einvoiceTables = { einvoice, einvoiceDailyBatch, dayClose };
