import { appendAudit, newId } from "@fnb/db";
import { businessDate } from "@fnb/domain";
import type pg from "pg";
import { queueDailyBatches } from "../einvoice/queue-daily-batches";
import { lockTenantChangeFeed } from "../sync/change-feed";
import { DAY_CLOSE_ERROR_CODES as CODES } from "./day-close-error-codes";
import { readDayStatus } from "./day-status";
import { daySummaryOf } from "./day-summary";

export interface DayCloseRequest {
  readonly tenantId: string;
  readonly branchId: string;
  readonly businessDate: string;
  readonly appUserId: string;
  readonly now: Date;
}

export interface ClosedDay {
  readonly id: string;
  readonly branchId: string;
  readonly businessDate: string;
  readonly closedByAppUserId: string;
  readonly closedAt: string;
  readonly summary: Record<string, unknown>;
}

export type DayCloseOutcome =
  | { readonly ok: true; readonly dayClose: ClosedDay; readonly batchIds: string[] }
  | {
      readonly ok: false;
      readonly status: 404 | 409;
      readonly body: { readonly code: string } & Record<string, unknown>;
    };

const refused = (status: 404 | 409, code: string, details: Record<string, unknown> = {}) =>
  ({ ok: false, status, body: { code, ...details } }) as const;

/**
 * Closes a branch's business day inside the caller's transaction: refused while a cash
 * shift of the day is open, a table of it is still a draft, or an invoice of it is still
 * queued (the answer lists them, so the manager knows what to chase), and refused for a
 * day the branch has not reached yet. Closing records the day's figures as they stand and
 * queues the batch sending its issued invoices on. One close per branch and day;
 * concurrent closes queue on a lock.
 */
export async function closeBusinessDay(
  client: pg.ClientBase,
  request: DayCloseRequest,
): Promise<DayCloseOutcome> {
  const branch = await client.query<{
    utc_offset_minutes: number;
    business_day_start_minute: number;
  }>("SELECT utc_offset_minutes, business_day_start_minute FROM branch WHERE id = $1", [
    request.branchId,
  ]);
  const clock = branch.rows[0];
  if (clock === undefined) return refused(404, CODES.branchNotFound);
  const today = businessDate(request.now.getTime(), {
    utcOffsetMinutes: clock.utc_offset_minutes,
    dayStartMinute: clock.business_day_start_minute,
  });
  if (request.businessDate > today) return refused(409, CODES.dayNotStarted, { today });
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('fnb.day_close.' || $1, 0))", [
    request.branchId,
  ]);
  // Till commands hold this lock until they commit: a payment of the day either lands
  // before the figures are read, or runs after the close and is marked as paid after it.
  await lockTenantChangeFeed(client, request.tenantId);
  const existing = await client.query(
    "SELECT 1 FROM day_close WHERE branch_id = $1 AND business_date = $2",
    [request.branchId, request.businessDate],
  );
  if ((existing.rowCount ?? 0) > 0) return refused(409, CODES.alreadyClosed);
  const status = await readDayStatus(client, request.branchId, request.businessDate);
  if (status.openShiftIds.length > 0) {
    return refused(409, CODES.shiftsOpen, { shiftIds: status.openShiftIds });
  }
  if (status.openDrafts.length > 0) {
    return refused(409, CODES.draftsOpen, { drafts: status.openDrafts });
  }
  if (status.unissuedInvoices.length > 0) {
    return refused(409, CODES.invoicesUnissued, { invoices: status.unissuedInvoices });
  }
  const dayClose: ClosedDay = {
    id: newId(),
    branchId: request.branchId,
    businessDate: request.businessDate,
    closedByAppUserId: request.appUserId,
    closedAt: request.now.toISOString(),
    summary: await daySummaryOf(client, request.branchId, request.businessDate, status),
  };
  await client.query(
    "INSERT INTO day_close (id, tenant_id, branch_id, business_date, closed_by_app_user_id, " +
      "closed_at, summary) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [
      dayClose.id,
      request.tenantId,
      dayClose.branchId,
      dayClose.businessDate,
      dayClose.closedByAppUserId,
      request.now,
      JSON.stringify(dayClose.summary),
    ],
  );
  const batchIds = await queueDailyBatches(client, { ...request, createdBy: request.appUserId });
  await appendAudit(client, {
    actor: { kind: "app_user", id: request.appUserId },
    action: "day.closed",
    entityKind: "day_close",
    entityId: dayClose.id,
    payload: { branchId: request.branchId, businessDate: request.businessDate, batchIds },
  });
  return { ok: true, dayClose, batchIds };
}
