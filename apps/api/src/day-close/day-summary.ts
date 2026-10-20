import type pg from "pg";
import { readDailySalesReport } from "../reports/daily-sales-report";
import type { DayStatus } from "./day-status";

/**
 * The figures a closed day keeps: its sales report and its invoices as they stood at the
 * close. Stored on the append-only close, so what was reported for the day cannot move
 * afterwards, even when a till that was offline syncs a sale of that day later.
 */
export async function daySummaryOf(
  client: pg.ClientBase,
  branchId: string,
  businessDate: string,
  status: DayStatus,
): Promise<Record<string, unknown>> {
  const { rows } = await client.query<{ issued: number }>(
    "SELECT count(*)::int AS issued FROM einvoice " +
      "WHERE branch_id = $1 AND business_date = $2 AND status = 'issued'",
    [branchId, businessDate],
  );
  return {
    report: await readDailySalesReport(client, branchId, businessDate),
    einvoices: {
      issued: rows[0]?.issued ?? 0,
      failedPermanent: status.failedInvoices.length,
    },
  };
}
