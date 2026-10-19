export type SqlValue = null | number | bigint | string;
export type SqlRow = Record<string, SqlValue>;

/**
 * The only seam between SQLite engines. The store above it issues the same SQL text on
 * node:sqlite (standing in for native SQLite in Tauri/Capacitor) and on SQLite WASM.
 */
export interface SqliteDriver {
  /** Runs one or more statements without parameters. */
  exec(sql: string): void;
  run(sql: string, params?: readonly SqlValue[]): void;
  all(sql: string, params?: readonly SqlValue[]): SqlRow[];
  close(): void;
}
