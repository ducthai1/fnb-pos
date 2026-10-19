export type SqlValue = null | number | bigint | string;
export type SqlRow = Record<string, SqlValue>;

/**
 * The only seam between SQLite engines (node:sqlite here; the native plugin of Tauri or
 * Capacitor, or SQLite WASM, later). Synchronous on purpose: the store runs a whole
 * transaction inside one of its own calls, with no await between BEGIN and COMMIT.
 */
export interface SqliteDriver {
  /** Runs one or more statements without parameters. */
  exec(sql: string): void;
  /** Runs one statement and answers how many rows it changed. */
  run(sql: string, params?: readonly SqlValue[]): number;
  all(sql: string, params?: readonly SqlValue[]): SqlRow[];
  close(): void;
}

/** Runs `work` as one IMMEDIATE transaction: all of its writes commit, or none do. */
export function inTransaction<T>(driver: SqliteDriver, work: () => T): T {
  // IMMEDIATE takes the write lock up front, so a second connection waits at BEGIN instead
  // of failing halfway through with SQLITE_BUSY after reading stale rows.
  driver.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    driver.exec("COMMIT");
    return result;
  } catch (error) {
    driver.exec("ROLLBACK");
    throw error;
  }
}
