import { bankTransaction, drizzleFor, paymentIntent, paymentWebhookEndpoint } from "@fnb/db";
import type pg from "pg";

export interface PaymentSeedIds {
  branch: string;
  device: string;
  sales_order: string;
  payment_intent: string;
  bank_transaction: string;
  payment_webhook_endpoint: string;
}

/** One row in every payment table: a QR for the graph's draft order, and what paid it. */
export async function seedPaymentRows(
  client: pg.PoolClient,
  tenantId: string,
  ids: PaymentSeedIds,
): Promise<void> {
  const db = drizzleFor(client);
  await db.insert(bankTransaction).values({
    id: ids.bank_transaction,
    tenantId,
    branchId: ids.branch,
    gateway: "fake",
    referenceCode: ids.bank_transaction,
    amount: 1000n,
    content: "FNB0123ABCD",
    transferType: "in",
    occurredAt: new Date(),
    receivedAt: new Date(),
    raw: {},
  });
  await db.insert(paymentIntent).values({
    id: ids.payment_intent,
    tenantId,
    orderId: ids.sales_order,
    branchId: ids.branch,
    deviceId: ids.device,
    amount: 1000n,
    contentCode: "FNB0123ABCD",
    status: "paid",
    expiresAt: new Date(),
    matchedTransactionId: ids.bank_transaction,
    receivedAmount: 1000n,
    matchedAt: new Date(),
  });
  await db.insert(paymentWebhookEndpoint).values({
    id: ids.payment_webhook_endpoint,
    tenantId,
    branchId: ids.branch,
    gateway: "fake",
    secretCiphertext: "v1.a.b.c",
  });
}
