import type pg from "pg";
import type { DayStatus } from "./day-status";

/**
 * The figures a closed day keeps: its invoices as they stood at the close. Stored on the
 * append-only close, so what was reported for the day cannot move afterwards.
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
    einvoices: {
      issued: rows[0]?.issued ?? 0,
      failedPermanent: status.failedInvoices.length,
    },
  };
}
