import { dayClose, drizzleFor, einvoice, einvoiceDailyBatch } from "@fnb/db";
import type pg from "pg";

export interface EInvoiceSeedIds {
  branch: string;
  app_user: string;
  sales_order: string;
  einvoice: string;
  einvoice_daily_batch: string;
  day_close: string;
}

/**
 * One row in every invoice table: the graph's order queued to be invoiced, a batch waiting
 * to be sent, and a closed day (summary `{}`, as the append-only tests expect).
 */
export async function seedEInvoiceRows(
  client: pg.PoolClient,
  tenantId: string,
  ids: EInvoiceSeedIds,
): Promise<void> {
  const db = drizzleFor(client);
  await db.insert(einvoice).values({
    id: ids.einvoice,
    tenantId,
    orderId: ids.sales_order,
    branchId: ids.branch,
    businessDate: "2026-10-20",
    nextAttemptAt: new Date(),
    provider: "fake",
    regimeVersion: "nd254-tt91",
    templateSymbol: "1C26MAA",
    seller: {},
    soldAt: new Date(),
    amounts: {},
  });
  await db.insert(einvoiceDailyBatch).values({
    id: ids.einvoice_daily_batch,
    tenantId,
    branchId: ids.branch,
    businessDate: "2026-10-19",
    provider: "fake",
    regimeVersion: "nd254-tt91",
    seller: {},
    invoiceCount: 0,
    nextAttemptAt: new Date(),
  });
  await db.insert(dayClose).values({
    id: ids.day_close,
    tenantId,
    branchId: ids.branch,
    businessDate: "2026-10-19",
    closedByAppUserId: ids.app_user,
    closedAt: new Date(),
    summary: {},
  });
}
