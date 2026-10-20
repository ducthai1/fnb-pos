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
  amounts: jsonb("amounts").notNull(),
  number: text("number"),
  taxAuthorityCode: text("tax_authority_code"),
  lookupCode: text("lookup_code"),
  lookupUrl: text("lookup_url"),
  issuedAt: at("issued_at"),
});

export const einvoiceTables = { einvoice };
