import { parseArgs } from "node:util";
import { readRestoreSettings } from "./backup-environment";
import { findPostgresTool } from "./postgres-client-tools";
import { restoreBackup } from "./restore-backup";

/**
 * `pnpm ops:restore <file> [--database <name>] [--replace-existing]`: a backup into a new
 * database (fnb_restored_<UTC time> unless named) on the server of FNB_RESTORE_ADMIN_URL.
 * The API keeps using its own database until FNB_DATABASE_URL is pointed at the new one.
 */
const usage = "usage: pnpm ops:restore <file> [--database <name>] [--replace-existing]";
let parsed: ReturnType<typeof parseCommandLine>;
try {
  parsed = parseCommandLine();
} catch (error) {
  console.error(`ops:restore: ${error instanceof Error ? error.message : error}\n${usage}`);
  process.exit(1);
}
const file = parsed.positionals[0];
if (file === undefined || parsed.positionals.length > 1) {
  console.error(`ops:restore: name exactly one backup file\n${usage}`);
  process.exit(1);
}
const configured = readRestoreSettings(process.env);
if (!configured.ok) {
  console.error("ops:restore: the environment is not valid:");
  for (const problem of configured.problems) console.error(`  - ${problem}`);
  process.exit(1);
}
const pgRestore = findPostgresTool("pg_restore", process.env);
if (pgRestore === null) {
  console.error(
    "ops:restore: pg_restore not found: install postgresql-client-17 or set FNB_PG_BIN_DIR",
  );
  process.exit(1);
}
const stamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "z")
  .toLowerCase();
const database = parsed.values.database ?? `fnb_restored_${stamp}`;
try {
  const outcome = await restoreBackup(configured.value, pgRestore, {
    file,
    database,
    replaceExisting: parsed.values["replace-existing"] === true,
  });
  if (outcome.kind === "refused") {
    console.error(`ops:restore: refused: ${outcome.reason}`);
    process.exit(1);
  }
  console.log(`ops:restore: restored ${file} into database ${database} in ${outcome.millis} ms`);
  console.log(
    outcome.generation === null
      ? "ops:restore: the backup predates server generations: migrating it draws one"
      : `ops:restore: new server generation ${outcome.generation}: tills will resend what it lacks`,
  );
  console.log(`ops:restore: point FNB_DATABASE_URL at database ${database} to serve it`);
} catch (error) {
  console.error(`ops:restore: failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}

function parseCommandLine() {
  return parseArgs({
    allowPositionals: true,
    options: {
      database: { type: "string" },
      "replace-existing": { type: "boolean" },
    },
  });
}
