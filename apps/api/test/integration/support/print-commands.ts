import { newId, withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { command } from "./sync-commands";
import type { Till } from "./sync-shop";

export interface PrintReport {
  jobId: string;
  kind: "bill" | "cup_label" | "kitchen" | "shift_report" | "pre_bill";
  status: "printed" | "failed";
  attempts: number;
  printerKey: string;
  // Undefined is how a test leaves a field out: JSON drops it on the way to the API.
  orderId?: string | undefined;
  shiftId?: string | undefined;
  errorCode?: string | undefined;
  occurredAt: string;
}

/** A bill of `orderId` the counter printer could not print after 3 tries, at `occurredAt`. */
export const failedBill = (orderId: string, occurredAt: string, more: Partial<PrintReport> = {}) =>
  ({
    jobId: newId(),
    kind: "bill",
    status: "failed",
    attempts: 3,
    printerKey: "counter",
    orderId,
    errorCode: "paper_out",
    occurredAt,
    ...more,
  }) satisfies PrintReport;

/** The same job printed afterwards: one more attempt, no error. */
export const printedLater = (failed: PrintReport, occurredAt: string, attempts = 4) =>
  ({
    ...failed,
    status: "printed",
    attempts,
    errorCode: undefined,
    occurredAt,
  }) satisfies PrintReport;

export const reported = (till: Till, report: PrintReport) =>
  command(till, "print.job_reported", report);

/** Every log row of the job, oldest report first. */
export const printLogOf = (pool: pg.Pool, tenantId: string, jobId: string) =>
  withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query(
      "SELECT branch_id, device_id, staff_id, kind, status, attempts, printer_key, order_id, " +
        "shift_id, error_code, occurred_at, payload FROM print_job_log WHERE job_id = $1 " +
        "ORDER BY occurred_at, attempts",
      [jobId],
    );
    return rows;
  });

/** GET /reports/print-failures as the member behind `cookie`. */
export const printFailures = (
  app: FastifyInstance,
  cookie: string,
  query: { branchId: string; from: string; to: string },
) =>
  app.inject({
    method: "GET",
    url: "/reports/print-failures",
    query,
    headers: { cookie },
  });
