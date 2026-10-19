import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { SqlRow, SqlValue, SqliteDriver } from "./sqlite-driver";

/**
 * FULL: a committed order survives a power cut, at ~1.2–1.6 ms per order on a real disk.
 * NORMAL: ~0.05 ms, but the last few orders before a power cut can be lost.
 */
export type SynchronousMode = "FULL" | "NORMAL";

export interface NodeSqliteOptions {
  /** FULL unless the shop chooses otherwise. */
  synchronous?: SynchronousMode;
}

/**
 * The till's database on node:sqlite: the same engine and SQL as the native SQLite of the
 * Tauri and Capacitor shells, without the IPC bridge. Used by tests and by Node tools.
 */
export function openNodeSqliteDriver(path: string, options: NodeSqliteOptions = {}): SqliteDriver {
  const synchronous = options.synchronous ?? "FULL";
  const db = new DatabaseSync(path);
  // WAL lets the screen read while sync writes; a busy timeout covers a second connection.
  db.exec(
    `PRAGMA journal_mode = WAL; PRAGMA synchronous = ${synchronous}; PRAGMA busy_timeout = 5000;`,
  );
  const statements = new Map<string, StatementSync>();
  const prepare = (sql: string): StatementSync => {
    let statement = statements.get(sql);
    if (statement === undefined) {
      statement = db.prepare(sql);
      statements.set(sql, statement);
    }
    return statement;
  };
  return {
    exec: (sql) => db.exec(sql),
    run: (sql, params: readonly SqlValue[] = []) => Number(prepare(sql).run(...params).changes),
    all: (sql, params: readonly SqlValue[] = []) => prepare(sql).all(...params) as SqlRow[],
    close: () => db.close(),
  };
}
