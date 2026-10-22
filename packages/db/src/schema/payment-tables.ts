import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { newId } from "../ids/new-id";
import { tenantRowColumns } from "./tenant-row-columns";

const money = (name: string) => bigint(name, { mode: "bigint" });
const at = (name: string) => timestamp(name, { withTimezone: true });

/** A VietQR a till showed for an order, and what was matched to it. */
export const paymentIntent = pgTable("payment_intent", {
  ...tenantRowColumns(),
  orderId: uuid("order_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  deviceId: uuid("device_id").notNull(),
  amount: money("amount").notNull(),
  contentCode: text("content_code").notNull(),
  status: text("status").notNull().default("pending"),
  expiresAt: at("expires_at").notNull(),
  matchedTransactionId: uuid("matched_transaction_id"),
  receivedAmount: money("received_amount"),
  matchedAt: at("matched_at"),
  /** Money no sale counts, handed back to the customer once; see 0025. */
  refundedAt: at("refunded_at"),
  refundedByAppUserId: uuid("refunded_by_app_user_id"),
  refundMethod: text("refund_method"),
  refundNote: text("refund_note"),
  refundBusinessDate: date("refund_business_date"),
  /** Handed back once its business day was closed: beside that day's report; see 0028. */
  refundedAfterDayClose: boolean("refunded_after_day_close").notNull().default(false),
  /** A wallet's payment (null for a VietQR): the wallet, its ref, what to scan; see 0032. */
  wallet: text("wallet"),
  gatewayRef: text("gateway_ref"),
  walletQr: text("wallet_qr"),
  nextQueryAt: at("next_query_at"),
  queryAttempts: integer("query_attempts").notNull().default(0),
});

/** A transfer a payment gateway reported; append-only, one row per gateway reference. */
export const bankTransaction = pgTable("bank_transaction", {
  id: uuid("id").primaryKey().$defaultFn(newId),
  tenantId: uuid("tenant_id").notNull(),
  branchId: uuid("branch_id").notNull(),
  gateway: text("gateway").notNull(),
  referenceCode: text("reference_code").notNull(),
  amount: money("amount").notNull(),
  content: text("content").notNull(),
  transferType: text("transfer_type").notNull(),
  occurredAt: at("occurred_at").notNull(),
  receivedAt: at("received_at").notNull(),
  raw: jsonb("raw").notNull(),
  createdAt: at("created_at").notNull().defaultNow(),
});

/** The sealed secret a branch's gateway signs its notices with, or a wallet's sealed keys. */
export const paymentWebhookEndpoint = pgTable("payment_webhook_endpoint", {
  ...tenantRowColumns(),
  branchId: uuid("branch_id").notNull(),
  gateway: text("gateway").notNull(),
  secretCiphertext: text("secret_ciphertext").notNull(),
  /** A wallet's keys may be kept while the wallet is off; see 0032. */
  enabled: boolean("enabled").notNull().default(true),
});

export const paymentTables = { paymentIntent, bankTransaction, paymentWebhookEndpoint };
