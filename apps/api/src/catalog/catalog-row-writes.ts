import type pg from "pg";
import { CATALOG_API_ERROR_CODES } from "./catalog-api-error-codes";
import { CatalogRequestError } from "./catalog-request-error";

/** Who writes and when; every catalog row records both. */
export interface CatalogWriteContext {
  tenantId: string;
  appUserId: string;
  now: Date;
}

// Table and column names below always come from this module's callers, never from a request.

export async function insertCatalogRow(
  client: pg.PoolClient,
  table: string,
  context: CatalogWriteContext,
  cells: Record<string, unknown>,
): Promise<void> {
  const row: Record<string, unknown> = {
    tenant_id: context.tenantId,
    created_at: context.now,
    updated_at: context.now,
    created_by: context.appUserId,
    ...cells,
  };
  const columns = Object.keys(row);
  await client.query(
    `INSERT INTO ${table} (${columns.join(", ")}) ` +
      `VALUES (${columns.map((_, index) => `$${index + 1}`).join(", ")})`,
    Object.values(row),
  );
}

export async function updateCatalogRow(
  client: pg.PoolClient,
  table: string,
  context: CatalogWriteContext,
  id: string,
  cells: Record<string, unknown>,
): Promise<void> {
  const columns = Object.keys(cells);
  const assignments = columns.map((column, index) => `${column} = $${index + 3}`);
  await client.query(
    `UPDATE ${table} SET ${[...assignments, "updated_at = $2", "version = version + 1"].join(", ")} ` +
      "WHERE id = $1",
    [id, context.now, ...Object.values(cells)],
  );
}

export interface VersionedRowSpec {
  table: string;
  id: string;
  /** The version the client last read; null when it means to create the row. */
  expectedVersion: number | null;
  /** The brand or branch the row belongs to, fixed once created. */
  parent: { column: string; value: string };
  cells: Record<string, unknown>;
  notFoundCode: string;
}

/**
 * Creates or replaces one row under optimistic locking. The row is locked first, so two
 * saves based on the same version cannot both pass the check; the loser gets 409 and
 * re-reads. Moving a row to another brand or branch is refused: menus, price lists and
 * kitchen routing of the old owner would silently keep pointing at it.
 */
export async function putVersionedRow(
  client: pg.PoolClient,
  context: CatalogWriteContext,
  spec: VersionedRowSpec,
): Promise<{ version: number; created: boolean }> {
  const current = await client.query<{ version: number; parent: string }>(
    `SELECT version, ${spec.parent.column} AS parent FROM ${spec.table} WHERE id = $1 FOR UPDATE`,
    [spec.id],
  );
  const row = current.rows[0];
  if (row === undefined) {
    if (spec.expectedVersion !== null) throw new CatalogRequestError(404, spec.notFoundCode);
    await insertCatalogRow(client, spec.table, context, {
      id: spec.id,
      [spec.parent.column]: spec.parent.value,
      ...spec.cells,
    });
    return { version: 1, created: true };
  }
  if (spec.expectedVersion !== row.version) {
    throw new CatalogRequestError(409, CATALOG_API_ERROR_CODES.versionConflict);
  }
  if (row.parent !== spec.parent.value) {
    throw new CatalogRequestError(400, CATALOG_API_ERROR_CODES.parentChangeNotAllowed);
  }
  await updateCatalogRow(client, spec.table, context, spec.id, spec.cells);
  return { version: row.version + 1, created: false };
}
