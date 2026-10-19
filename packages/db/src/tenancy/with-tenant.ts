import type pg from "pg";
import { DatabaseError } from "../database-error";
import { DB_ERROR_CODES } from "../db-error-codes";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs `work` in one transaction whose row level security tenant is `tenantId`. The
 * setting is transaction-local (`set_config(..., true)`), so it ends with COMMIT or
 * ROLLBACK and never leaks to the next request that borrows the pooled connection.
 * Outside this function the app role sees no tenant rows at all.
 */
export async function withTenant<T>(
  pool: pg.Pool,
  tenantId: string,
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  if (!UUID.test(tenantId)) {
    throw new DatabaseError(DB_ERROR_CODES.invalidTenantId, `tenant id is not a uuid: ${tenantId}`);
  }
  const client = await pool.connect();
  let broken: Error | undefined;
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      // The connection is unusable; destroy it instead of returning it to the pool.
      broken = rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError));
    }
    throw error;
  } finally {
    client.release(broken);
  }
}
