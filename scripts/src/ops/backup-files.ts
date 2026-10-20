const BACKUP_FILE = /^fnb-([a-z_][a-z0-9_]*)-(\d{8}T\d{6}Z)\.dump$/;

/**
 * `fnb-<database>-<UTC time>.dump`, such as fnb-fnb-20261021T023500Z.dump. UTC, so names
 * sort in the order the backups were taken whatever the server's time zone or a change
 * of daylight saving, and two servers never disagree about which file is newer.
 */
export function backupFileName(database: string, takenAt: Date): string {
  const stamp = takenAt
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  return `fnb-${database}-${stamp}.dump`;
}

/**
 * The backups of `database` among `names` that fall outside the newest `keep`, oldest
 * first. Files that are not this tool's backups of that database are never chosen.
 */
export function backupsToDelete(
  names: readonly string[],
  database: string,
  keep: number,
): string[] {
  const ours = names
    .filter((name) => BACKUP_FILE.exec(name)?.[1] === database)
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  return ours.slice(keep).reverse();
}
