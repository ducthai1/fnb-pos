import { type SqliteDriver, inTransaction } from "./sqlite-driver";

/*
 * The outbox keeps every command after the server answered it: that is the till's journal
 * of what the server took. A server restored from a backup forgets what it took after the
 * backup, and the journal is what the till sends again then (see server-restore.ts). Rows
 * settled longer ago than the retention are dropped; the outbox counter is AUTOINCREMENT,
 * so a dropped row's device_seq is never handed out again.
 */

/** Tills made before the journal had an age have no settled_at column yet. */
export function ensureJournalColumns(driver: SqliteDriver): void {
  const columns = driver.all("PRAGMA table_info(outbox)").map((row) => String(row.name));
  if (!columns.includes("settled_at")) driver.exec("ALTER TABLE outbox ADD COLUMN settled_at TEXT");
}

export interface JournalPruning {
  /** The till's clock now, as an ISO instant. */
  readonly now: string;
  /** Settled commands answered before this instant are dropped. */
  readonly settledBefore: string;
}

/**
 * Drops settled commands answered before `settledBefore`; pending ones are never touched.
 * A command settled before the journal had an age is stamped `now` first, so it is kept
 * for a whole retention from today rather than dropped at once or kept for ever.
 */
export function pruneJournal(driver: SqliteDriver, pruning: JournalPruning): number {
  return inTransaction(driver, () => {
    driver.run(
      "UPDATE outbox SET settled_at = ? WHERE status <> 'pending' AND settled_at IS NULL",
      [pruning.now],
    );
    return driver.run("DELETE FROM outbox WHERE status <> 'pending' AND settled_at < ?", [
      pruning.settledBefore,
    ]);
  });
}
