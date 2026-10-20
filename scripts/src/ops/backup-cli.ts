import { readBackupSettings } from "./backup-environment";
import { findPostgresTool } from "./postgres-client-tools";
import { takeBackup } from "./take-backup";

/**
 * `pnpm ops:backup`: one backup of FNB_BACKUP_DATABASE_URL into FNB_BACKUP_DIRECTORY,
 * keeping the newest FNB_BACKUP_KEEP. The password comes from PGPASSFILE (or the URL, and
 * then reaches pg_dump through its environment only). Prints the file, never the URL.
 */
const configured = readBackupSettings(process.env);
if (!configured.ok) {
  console.error("ops:backup: the environment is not valid:");
  for (const problem of configured.problems) console.error(`  - ${problem}`);
  process.exit(1);
}
const pgDump = findPostgresTool("pg_dump", process.env);
if (pgDump === null) {
  console.error(
    "ops:backup: pg_dump not found: install postgresql-client-17 or set FNB_PG_BIN_DIR",
  );
  process.exit(1);
}
try {
  const result = await takeBackup(configured.value, pgDump);
  const megabytes = (result.bytes / 1_048_576).toFixed(2);
  console.log(`ops:backup: wrote ${result.file} (${megabytes} MB in ${result.millis} ms)`);
  console.log(`ops:backup: deleted ${result.deleted.length} older backups`);
} catch (error) {
  console.error(`ops:backup: failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
