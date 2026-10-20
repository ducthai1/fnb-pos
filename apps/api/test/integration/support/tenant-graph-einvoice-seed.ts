import { drizzleFor, einvoice } from "@fnb/db";
import type pg from "pg";

export interface EInvoiceSeedIds {
  branch: string;
  sales_order: string;
  einvoice: string;
}

/** One row in every invoice table: the graph's order, queued to be invoiced. */
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
}
