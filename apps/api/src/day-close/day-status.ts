import type pg from "pg";

export interface DayInvoice {
  id: string;
  orderId: string;
  status: string;
  attempts: number;
  lastErrorCode: string | null;
}

export interface DayBatch {
  id: string;
  status: string;
  invoiceCount: number;
  attempts: number;
  reference: string | null;
  lastErrorCode: string | null;
}

/** An order of the day as a manager finds it on the till: which till, which number. */
export interface DayOrder {
  id: string;
  deviceId: string;
  deviceOrderNo: number;
}

/**
 * Where a branch's business day stands: what would stop it closing (open shifts, drafts
 * still open, invoices still queued) and what needs a person even once it is closed
 * (orders paid after the close, invoices failed for good, issued invoices no submitted
 * batch carries yet, batches not through).
 */
export interface DayStatus {
  openShiftIds: string[];
  openDrafts: DayOrder[];
  /** Settled once the day was closed: outside its figures, which the close froze. */
  paidAfterClose: (DayOrder & { refundOfOrderId: string | null })[];
  unissuedInvoices: DayInvoice[];
  failedInvoices: DayInvoice[];
  /** Issued, but in no batch the provider has taken: the day's data is not all sent. */
  unsentInvoices: DayInvoice[];
  batches: DayBatch[];
}

export async function readDayStatus(
  client: pg.ClientBase,
  branchId: string,
  businessDate: string,
): Promise<DayStatus> {
  const shifts = await client.query<{ id: string }>(
    "SELECT id FROM shift WHERE branch_id = $1 AND business_date = $2 AND status <> 'closed' " +
      "ORDER BY id",
    [branchId, businessDate],
  );
  const orders = await client.query<{
    id: string;
    device_id: string;
    device_order_no: string;
    status: string;
    refund_of_order_id: string | null;
  }>(
    "SELECT id, device_id, device_order_no, status, refund_of_order_id FROM sales_order " +
      "WHERE branch_id = $1 AND business_date = $2 " +
      "AND (status = 'draft' OR paid_after_day_close) ORDER BY device_id, device_order_no",
    [branchId, businessDate],
  );
  const dayOrder = (row: (typeof orders.rows)[number]): DayOrder => ({
    id: row.id,
    deviceId: row.device_id,
    deviceOrderNo: Number(row.device_order_no),
  });
  const invoices = await client.query<{
    id: string;
    order_id: string;
    status: string;
    attempts: number;
    last_error_code: string | null;
    sent: boolean;
  }>(
    "SELECT e.id, e.order_id, e.status, e.attempts, e.last_error_code, " +
      "coalesce(b.status = 'submitted', false) AS sent FROM einvoice e " +
      "LEFT JOIN einvoice_daily_batch b ON b.id = e.batch_id " +
      "WHERE e.branch_id = $1 AND e.business_date = $2 ORDER BY e.sold_at, e.id",
    [branchId, businessDate],
  );
  const batches = await client.query<{
    id: string;
    status: string;
    invoice_count: number;
    attempts: number;
    reference: string | null;
    last_error_code: string | null;
  }>(
    "SELECT id, status, invoice_count, attempts, reference, last_error_code " +
      "FROM einvoice_daily_batch WHERE branch_id = $1 AND business_date = $2 ORDER BY created_at, id",
    [branchId, businessDate],
  );
  const all = invoices.rows.map((row) => ({
    invoice: {
      id: row.id,
      orderId: row.order_id,
      status: row.status,
      attempts: row.attempts,
      lastErrorCode: row.last_error_code,
    },
    sent: row.sent,
  }));
  const where = (keep: (row: (typeof all)[number]) => boolean) =>
    all.filter(keep).map((row) => row.invoice);
  return {
    openShiftIds: shifts.rows.map((row) => row.id),
    openDrafts: orders.rows.filter((row) => row.status === "draft").map(dayOrder),
    paidAfterClose: orders.rows
      .filter((row) => row.status !== "draft")
      .map((row) => ({ ...dayOrder(row), refundOfOrderId: row.refund_of_order_id })),
    unissuedInvoices: where(
      (row) => row.invoice.status === "pending" || row.invoice.status === "failed_retryable",
    ),
    failedInvoices: where((row) => row.invoice.status === "failed_permanent"),
    unsentInvoices: where((row) => row.invoice.status === "issued" && !row.sent),
    batches: batches.rows.map((row) => ({
      id: row.id,
      status: row.status,
      invoiceCount: row.invoice_count,
      attempts: row.attempts,
      reference: row.reference,
      lastErrorCode: row.last_error_code,
    })),
  };
}
