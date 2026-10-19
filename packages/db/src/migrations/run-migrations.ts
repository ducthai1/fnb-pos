import pg from "pg";
import { DatabaseError } from "../database-error";
import { DB_ERROR_CODES } from "../db-error-codes";
import {
  type MigrationFile,
  MIGRATIONS_DIRECTORY,
  listMigrationFiles,
} from "./list-migration-files";

export interface MigrationReport {
  applied: string[];
  alreadyApplied: string[];
}

// The ledger lives outside `public`: the app role is granted DML on `public` tables by
// default privileges, and it must never be able to rewrite migration history.
const ENSURE_LEDGER = `
  CREATE SCHEMA IF NOT EXISTS fnb_migration;
  CREATE TABLE IF NOT EXISTS fnb_migration.applied_migration (
    name text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  );`;

// Serializes concurrent runners (several API instances starting at once). The lock is
// transaction-scoped, so a crashed runner can never leave it held.
const LOCK = "SELECT pg_advisory_xact_lock(hashtext('fnb_migration'))";

/**
 * Applies pending SQL migrations in file-name order, each in its own transaction, and
 * records them in the ledger. Must run as the schema owner role, never as the app role.
 * Re-running is a no-op; a file edited after it was applied stops the run. Files must not
 * contain their own BEGIN/COMMIT.
 */
export async function runMigrations(
  connectionString: string,
  options: { directory?: string } = {},
): Promise<MigrationReport> {
  const files = await listMigrationFiles(options.directory ?? MIGRATIONS_DIRECTORY);
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await inTransaction(client, () => client.query(ENSURE_LEDGER));
    const report: MigrationReport = { applied: [], alreadyApplied: [] };
    for (const file of files) {
      const applied = await inTransaction(client, () => applyOnce(client, file));
      (applied ? report.applied : report.alreadyApplied).push(file.name);
    }
    return report;
  } finally {
    await client.end();
  }
}

async function applyOnce(client: pg.Client, file: MigrationFile): Promise<boolean> {
  const existing = await client.query<{ checksum: string }>(
    "SELECT checksum FROM fnb_migration.applied_migration WHERE name = $1",
    [file.name],
  );
  const recorded = existing.rows[0];
  if (recorded !== undefined) {
    if (recorded.checksum !== file.checksum) {
      throw new DatabaseError(
        DB_ERROR_CODES.migrationChecksumMismatch,
        `${file.name} changed after it was applied; add a new migration instead of editing it`,
      );
    }
    return false;
  }
  try {
    await client.query(file.sql);
  } catch (error) {
    throw new DatabaseError(
      DB_ERROR_CODES.migrationFailed,
      `${file.name} failed: ${String(error)}`,
      {
        cause: error,
      },
    );
  }
  await client.query(
    "INSERT INTO fnb_migration.applied_migration (name, checksum) VALUES ($1, $2)",
    [file.name, file.checksum],
  );
  return true;
}

async function inTransaction<T>(client: pg.Client, work: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    await client.query(LOCK);
    const result = await work();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    // A failed ROLLBACK means the connection is gone; report the error that caused it.
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}
