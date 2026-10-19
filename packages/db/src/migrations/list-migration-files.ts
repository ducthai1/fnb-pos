import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseError } from "../database-error";
import { DB_ERROR_CODES } from "../db-error-codes";

export interface MigrationFile {
  /** e.g. "0001_tenancy.sql" */
  name: string;
  sql: string;
  /** sha256 of the file, so an edit after it was applied is detected instead of ignored. */
  checksum: string;
}

/** The migrations shipped with this package. */
export const MIGRATIONS_DIRECTORY = fileURLToPath(new URL("../../migrations/", import.meta.url));

// Names carry a domain slug, never a delivery stage: "0007_kitchen_ticket.sql".
const FILE_NAME = /^(\d{4})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;

/** Every `.sql` file in the directory, in the order it must be applied. */
export async function listMigrationFiles(directory: string): Promise<MigrationFile[]> {
  const names = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  const seenNumbers = new Set<string>();
  const files: MigrationFile[] = [];
  for (const name of names) {
    const match = FILE_NAME.exec(name);
    if (match === null) {
      throw new DatabaseError(
        DB_ERROR_CODES.migrationInvalidFileName,
        `migration file name must look like 0001_domain_slug.sql: ${name}`,
      );
    }
    const number = match[1]!;
    if (seenNumbers.has(number)) {
      throw new DatabaseError(
        DB_ERROR_CODES.migrationDuplicateNumber,
        `two migration files share the number ${number}; their order would be ambiguous`,
      );
    }
    seenNumbers.add(number);
    const sql = await readFile(join(directory, name), "utf8");
    files.push({ name, sql, checksum: createHash("sha256").update(sql).digest("hex") });
  }
  return files;
}
