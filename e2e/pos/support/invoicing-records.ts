import { withTenant } from "@fnb/db";
import type pg from "pg";

export interface StoredInvoice {
  status: string;
  buyerTaxCode: string | null;
  lookupCode: string | null;
}

/** The e-invoices of the till's orders, as the database holds them. */
export const invoicesOfTill = (pool: pg.Pool, tenantId: string, deviceId: string) =>
  withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query<StoredInvoice>(
      'SELECT e.status, e.buyer->>\'taxCode\' AS "buyerTaxCode", e.lookup_code AS "lookupCode" ' +
        "FROM einvoice e JOIN sales_order o ON o.id = e.order_id WHERE o.device_id = $1",
      [deviceId],
    );
    return rows;
  });

/** How the till's bills came out, oldest first: a reprint is a job of its own. */
export const billJobsOfTill = (pool: pg.Pool, tenantId: string, deviceId: string) =>
  withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query<{ status: string }>(
      "SELECT j.status FROM print_job_log j JOIN sales_order o ON o.id = j.order_id " +
        "WHERE o.device_id = $1 AND j.kind = 'bill' ORDER BY j.created_at",
      [deviceId],
    );
    return rows.map((row) => row.status);
  });
