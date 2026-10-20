import type pg from "pg";
import { newId } from "../ids/new-id";
import { CURRENT_TENANT_SQL } from "../tenancy/current-tenant-sql";
import { toJsonPayload } from "./to-json-payload";

export interface ApprovalRecord {
  /** Generated where the approval happened, so a till offline at the time keeps its id. */
  id?: string;
  /** The permission key that was approved, e.g. "refund". */
  actionKey: string;
  requestedByStaffId: string;
  approvedByStaffId: string;
  deviceId: string;
  branchId: string;
  /** What was approved (order, line, rate, amount), for whoever reads the trail later. */
  payload?: Readonly<Record<string, unknown>>;
  /**
   * When it was given, by the caller's clock: commands relying on it are timed by that same
   * clock. The database's own time when left out.
   */
  createdAt?: Date;
}

/**
 * Appends one approval to the trail of the tenant of the current withTenant transaction,
 * so it commits or rolls back together with the action it approved. Outside withTenant
 * there is no tenant and row level security refuses the insert.
 */
export async function recordApproval(
  client: pg.ClientBase,
  record: ApprovalRecord,
): Promise<string> {
  const id = record.id ?? newId();
  await client.query(
    `INSERT INTO approval_log (id, tenant_id, action_key, requested_by_staff_id,
       approved_by_staff_id, device_id, branch_id, payload, created_at)
     VALUES ($1, ${CURRENT_TENANT_SQL}, $2, $3, $4, $5, $6, $7::jsonb, coalesce($8, now()))`,
    [
      id,
      record.actionKey,
      record.requestedByStaffId,
      record.approvedByStaffId,
      record.deviceId,
      record.branchId,
      toJsonPayload(record.payload ?? {}),
      record.createdAt ?? null,
    ],
  );
  return id;
}
