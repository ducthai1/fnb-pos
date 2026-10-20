import type pg from "pg";

/** The most failures one answer lists; a longer list says so instead of growing unbounded. */
export const PRINT_FAILURES_LIMIT = 500;

export interface PrintFailure {
  readonly jobId: string;
  readonly kind: string;
  readonly printerKey: string;
  readonly attempts: number;
  readonly errorCode: string;
  readonly occurredAt: string;
  readonly deviceId: string;
  readonly staffId: string;
  readonly orderId: string | null;
  readonly deviceOrderNo: number | null;
  readonly callNumber: string | null;
  readonly shiftId: string | null;
}

/**
 * Print jobs of the branch whose last failure in [from, to) has no printed report after it,
 * newest first: the slips that never came out. "After" is by the till's clock, then by the
 * attempt count, so a job printed on its next retry within the same millisecond is still
 * cleared. A printed report after `to` clears the failure too: the list is of what is still
 * missing now. A job failing again after it once printed is listed: that reprint is missing.
 */
export async function readPrintFailures(
  client: pg.ClientBase,
  window: { branchId: string; from: string; to: string },
) {
  const { rows } = await client.query(
    "SELECT * FROM (SELECT DISTINCT ON (f.job_id) f.job_id, f.kind, f.printer_key, f.attempts, " +
      "f.error_code, f.occurred_at, f.device_id, f.staff_id, f.order_id, o.device_order_no, " +
      "o.call_number, f.shift_id FROM print_job_log f " +
      "LEFT JOIN sales_order o ON o.id = f.order_id " +
      "WHERE f.branch_id = $1 AND f.status = 'failed' AND f.occurred_at >= $2 " +
      "AND f.occurred_at < $3 AND NOT EXISTS (SELECT 1 FROM print_job_log p " +
      "WHERE p.job_id = f.job_id AND p.status = 'printed' " +
      "AND (p.occurred_at, p.attempts) > (f.occurred_at, f.attempts)) " +
      "ORDER BY f.job_id, f.occurred_at DESC, f.attempts DESC) failed " +
      "ORDER BY occurred_at DESC, job_id LIMIT $4",
    [window.branchId, window.from, window.to, PRINT_FAILURES_LIMIT + 1],
  );
  const failures = rows.slice(0, PRINT_FAILURES_LIMIT).map((row): PrintFailure => ({
    jobId: row.job_id,
    kind: row.kind,
    printerKey: row.printer_key,
    attempts: row.attempts,
    errorCode: row.error_code,
    occurredAt: (row.occurred_at as Date).toISOString(),
    deviceId: row.device_id,
    staffId: row.staff_id,
    orderId: row.order_id,
    deviceOrderNo: row.device_order_no === null ? null : Number(row.device_order_no),
    callNumber: row.call_number,
    shiftId: row.shift_id,
  }));
  return { failures, truncated: rows.length > PRINT_FAILURES_LIMIT };
}
