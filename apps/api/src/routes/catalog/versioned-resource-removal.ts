import type pg from "pg";
import { CATALOG_API_ERROR_CODES } from "../../catalog/catalog-api-error-codes";
import { CatalogRequestError, isForeignKeyViolation } from "../../catalog/catalog-request-error";

export type Removal = "deleted" | "archived";

export interface RemovableResource {
  table: string;
  owner: { column: string };
  /** Tells the tills that sell from the owner, in the writer's transaction. */
  recordChange(client: pg.PoolClient, tenantId: string, ownerId: string, id: string): Promise<void>;
  /**
   * Set on a row that is archived (`archived_at`) when history still points at it, instead
   * of refused. `inUse` is what makes even archiving wrong: a live reference that would stop
   * working, answered 409.
   */
  archivable?: { inUse(client: pg.PoolClient, id: string): Promise<boolean> };
}

/**
 * Removes the row the caller saw at `version`, or archives it where it is archivable and
 * history points at it. Answers null for a row that is not there. The row is locked before
 * the version is read, so two removals, or a removal and an edit, never both pass.
 */
export async function removeVersionedRow(
  client: pg.PoolClient,
  resource: RemovableResource,
  id: string,
  version: number,
  now: Date,
): Promise<{ outcome: Removal; owner: string; version: number } | null> {
  const stored = await client.query<{ version: number; owner: string }>(
    `SELECT version, ${resource.owner.column} AS owner FROM ${resource.table} WHERE id = $1 FOR UPDATE`,
    [id],
  );
  const row = stored.rows[0];
  if (row === undefined) return null;
  if (row.version !== version) {
    throw new CatalogRequestError(409, CATALOG_API_ERROR_CODES.versionConflict);
  }
  if (resource.archivable !== undefined && (await resource.archivable.inUse(client, id))) {
    throw new CatalogRequestError(409, CATALOG_API_ERROR_CODES.inUse);
  }
  // Inside a savepoint: a refused DELETE aborts the transaction, and archiving must follow it.
  await client.query("SAVEPOINT remove_row");
  try {
    await client.query(`DELETE FROM ${resource.table} WHERE id = $1`, [id]);
    await client.query("RELEASE SAVEPOINT remove_row");
    return { outcome: "deleted", owner: row.owner, version: row.version };
  } catch (error) {
    if (!isForeignKeyViolation(error)) throw error;
    await client.query("ROLLBACK TO SAVEPOINT remove_row");
    if (resource.archivable === undefined) throw error;
  }
  await client.query(
    `UPDATE ${resource.table} SET archived_at = coalesce(archived_at, $2), updated_at = $2, ` +
      "version = version + 1 WHERE id = $1",
    [id, now],
  );
  return { outcome: "archived", owner: row.owner, version: row.version + 1 };
}
