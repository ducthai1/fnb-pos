import { newId, withTenant } from "@fnb/db";
import type pg from "pg";
import { postgresErrorCode } from "./postgres-error-code";

export const CHECK_VIOLATION = "23514";
export const FOREIGN_KEY_VIOLATION = "23503";
export const UNIQUE_VIOLATION = "23505";
export const INSUFFICIENT_PRIVILEGE = "42501";

/**
 * Inserts one row as the app role in its own transaction (a refused statement aborts the
 * transaction it ran in) and returns the SQLSTATE, or "no-error" when the row was stored.
 */
export function insertAttempt(
  pool: pg.Pool,
  tenantId: string,
  table: string,
  cells: Record<string, unknown>,
): Promise<string> {
  const row: Record<string, unknown> = { id: newId(), tenant_id: tenantId, ...cells };
  const columns = Object.keys(row);
  const sql =
    `INSERT INTO ${table} (${columns.join(", ")}) ` +
    `VALUES (${columns.map((_, index) => `$${index + 1}`).join(", ")})`;
  return withTenant(pool, tenantId, (client) =>
    postgresErrorCode(() => client.query(sql, Object.values(row))),
  );
}
