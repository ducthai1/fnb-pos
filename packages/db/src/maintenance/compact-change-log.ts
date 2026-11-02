import type pg from "pg";
import { withTenant } from "../tenancy/with-tenant";

export interface ChangeLogCompaction {
  /** Copies made before this moment may go, once a newer copy of the same row exists. */
  readonly olderThan: Date;
  /** Copies removed per transaction. */
  readonly batchSize: number;
  /** Batches per tenant in one run; the next run carries on where this one stopped. */
  readonly maxBatchesPerTenant: number;
}

export interface ChangeLogCompactionReport {
  readonly changeLogRows: number;
  readonly tenants: number;
}

/**
 * One tenant's feed, compacted in short batches, each its own transaction under the tenant's
 * row level security: tills keep pulling and writing in between. A batch that comes back
 * short means nothing older is left to remove.
 */
export async function compactTenantChangeLog(
  pool: pg.Pool,
  tenantId: string,
  settings: ChangeLogCompaction,
): Promise<number> {
  let removed = 0;
  for (let batch = 0; batch < settings.maxBatchesPerTenant; batch++) {
    const { rows } = await withTenant(pool, tenantId, (client) =>
      client.query<{ removed: number }>("SELECT compact_change_log($1, $2) AS removed", [
        settings.olderThan,
        settings.batchSize,
      ]),
    );
    const count = rows[0]?.removed ?? 0;
    removed += count;
    if (count < settings.batchSize) break;
  }
  return removed;
}

/** Every tenant's feed in turn, one tenant at a time. */
export async function compactChangeLog(
  pool: pg.Pool,
  settings: ChangeLogCompaction,
): Promise<ChangeLogCompactionReport> {
  const { rows } = await pool.query<{ tenant_id: string }>(
    "SELECT tenant_id FROM fnb_auth.tenants_to_sweep() AS tenant_id",
  );
  let changeLogRows = 0;
  for (const { tenant_id: tenantId } of rows) {
    changeLogRows += await compactTenantChangeLog(pool, tenantId, settings);
  }
  return { changeLogRows, tenants: rows.length };
}
