import { bigint, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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

/** The sealed secret a branch's gateway signs its notices with. */
export const paymentWebhookEndpoint = pgTable("payment_webhook_endpoint", {
  ...tenantRowColumns(),
  branchId: uuid("branch_id").notNull(),
  gateway: text("gateway").notNull(),
  secretCiphertext: text("secret_ciphertext").notNull(),
});

export const paymentTables = { paymentIntent, bankTransaction, paymentWebhookEndpoint };
