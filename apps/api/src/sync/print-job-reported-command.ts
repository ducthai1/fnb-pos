import { type PrintJobReportedPayload, printJobReportedPayloadSchema } from "@fnb/contracts";
import { newId } from "@fnb/db";
import { PRINT_SYNC_ERROR_CODES as P } from "./print-sync-error-codes";
import type { SyncCommandContext } from "./sync-command-context";
import { defineSyncCommand } from "./sync-command-definition";
import { CommandRejection } from "./sync-error-codes";

/**
 * The order or shift a report names must be one of the till's branch: the report lands in
 * that branch's failures, and a till must not learn whether an id exists elsewhere.
 */
async function ofBranch(context: SyncCommandContext, table: "sales_order" | "shift", id: string) {
  const { rowCount } = await context.client.query(
    `SELECT 1 FROM ${table} WHERE id = $1 AND branch_id = $2`,
    [id, context.device.branchId],
  );
  return rowCount === 1;
}

/**
 * print.job_reported: keeps how a print job came out, as one more row of the job's log.
 * Whether the bill or ticket itself was right is not this command's to judge: it records
 * what the till says its printer did, for the manager's list of slips that never came out.
 * Answers the row it added, which no till syncs, so nothing goes into the change feed.
 */
async function reportPrintJob(context: SyncCommandContext, payload: PrintJobReportedPayload) {
  const { client, device, staffId, command } = context;
  if (payload.orderId !== undefined && !(await ofBranch(context, "sales_order", payload.orderId)))
    throw new CommandRejection(P.orderNotFound);
  if (payload.shiftId !== undefined && !(await ofBranch(context, "shift", payload.shiftId)))
    throw new CommandRejection(P.shiftNotFound);
  const id = newId();
  await client.query(
    "INSERT INTO print_job_log (id, tenant_id, branch_id, device_id, staff_id, command_id, " +
      "job_id, kind, status, attempts, printer_key, order_id, shift_id, error_code, " +
      "occurred_at, payload) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, " +
      "$14, $15, $16)",
    [
      id,
      device.tenantId,
      device.branchId,
      device.deviceId,
      staffId,
      command.commandId,
      payload.jobId,
      payload.kind,
      payload.status,
      payload.attempts,
      payload.printerKey,
      payload.orderId ?? null,
      payload.shiftId ?? null,
      payload.errorCode ?? null,
      payload.occurredAt,
      JSON.stringify(command.payload),
    ],
  );
  return id;
}

export const printJobReportedCommand = defineSyncCommand(
  "print.job_reported",
  printJobReportedPayloadSchema,
  reportPrintJob,
  "print_job",
);
