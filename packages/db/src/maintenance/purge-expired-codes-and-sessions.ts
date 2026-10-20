import type pg from "pg";
import { withTenant } from "../tenancy/with-tenant";

/** What is deleted: codes expired before `codesExpiredBefore`, sessions before the other. */
export interface PurgeCutoffs {
  readonly codesExpiredBefore: Date;
  readonly sessionsExpiredBefore: Date;
}

export interface TenantPurge {
  readonly pairingCodes: number;
  readonly staffSessions: number;
}

export interface PurgeReport extends TenantPurge {
  readonly backofficeSessions: number;
  readonly tenants: number;
}

/**
 * One tenant's expired pairing codes and staff sessions, as the app role inside the
 * tenant's own transaction: row level security keeps the deletes in that tenant whatever
 * the filter says. Nothing points at either table, so no history loses a reference.
 */
export async function purgeTenantCodesAndSessions(
  pool: pg.Pool,
  tenantId: string,
  cutoffs: PurgeCutoffs,
): Promise<TenantPurge> {
  return withTenant(pool, tenantId, async (client) => {
    const codes = await client.query("DELETE FROM device_pairing_code WHERE expires_at < $1", [
      cutoffs.codesExpiredBefore,
    ]);
    const sessions = await client.query("DELETE FROM staff_session WHERE expires_at < $1", [
      cutoffs.sessionsExpiredBefore,
    ]);
    return { pairingCodes: codes.rowCount ?? 0, staffSessions: sessions.rowCount ?? 0 };
  });
}

/**
 * Every tenant's expired codes and sessions, then the global backoffice sessions. Each
 * tenant is its own short transaction, so a large shop never holds the others up, and a
 * run that stops halfway leaves nothing half done: the next run carries on.
 */
export async function purgeExpiredCodesAndSessions(
  pool: pg.Pool,
  cutoffs: PurgeCutoffs,
): Promise<PurgeReport> {
  const { rows } = await pool.query<{ tenant_id: string }>(
    "SELECT tenant_id FROM fnb_auth.tenants_to_sweep() AS tenant_id",
  );
  let pairingCodes = 0;
  let staffSessions = 0;
  for (const { tenant_id: tenantId } of rows) {
    const purged = await purgeTenantCodesAndSessions(pool, tenantId, cutoffs);
    pairingCodes += purged.pairingCodes;
    staffSessions += purged.staffSessions;
  }
  const backoffice = await pool.query<{ purged: string }>(
    "SELECT fnb_auth.purge_expired_sessions($1) AS purged",
    [cutoffs.sessionsExpiredBefore],
  );
  return {
    pairingCodes,
    staffSessions,
    backofficeSessions: Number(backoffice.rows[0]?.purged ?? 0),
    tenants: rows.length,
  };
}
