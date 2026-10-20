import { chmod, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { BackupSettings } from "./backup-environment";
import { backupFileName, backupsToDelete } from "./backup-files";
import { libpqEnvironment, runPostgresTool } from "./postgres-client-tools";

export interface BackupResult {
  readonly file: string;
  readonly bytes: number;
  readonly millis: number;
  readonly deleted: readonly string[];
}

/**
 * One pg_dump in the custom format (compressed, restorable table by table) into the
 * backup directory, then rotation down to the newest `keep`. The dump is written under a
 * `.partial` name and renamed only once pg_dump has succeeded, so a crash or a full disk
 * never leaves a file that looks like a backup, and rotation never counts a broken one.
 */
export async function takeBackup(
  settings: BackupSettings,
  pgDump: string,
  now: () => Date = () => new Date(),
): Promise<BackupResult> {
  const connection = libpqEnvironment(settings.databaseUrl);
  const database = connection.PGDATABASE ?? "";
  await mkdir(settings.directory, { recursive: true, mode: 0o700 });
  const started = now();
  const file = join(settings.directory, backupFileName(database, started));
  const partial = `${file}.partial`;
  const run = await runPostgresTool(
    pgDump,
    ["--format=custom", "--no-password", "--lock-wait-timeout=60000", `--file=${partial}`],
    connection,
  );
  if (run.exitCode !== 0) {
    await rm(partial, { force: true });
    throw new Error(`pg_dump exited with ${run.exitCode}: ${run.stderr.trim()}`);
  }
  await chmod(partial, 0o600);
  await rename(partial, file);
  const { size } = await stat(file);
  const deleted = backupsToDelete(await readdir(settings.directory), database, settings.keep);
  for (const name of deleted) await rm(join(settings.directory, name));
  return { file, bytes: size, millis: now().getTime() - started.getTime(), deleted };
}
