import { DatabaseSync, type StatementSync } from "node:sqlite";
import type { SqlRow, SqlValue, SqliteDriver } from "./sqlite-driver";

export type SynchronousMode = "FULL" | "NORMAL";

/**
 * node:sqlite stands in for the native SQLite that Tauri and Capacitor ship: same engine,
 * same SQL, no IPC. WAL + synchronous=FULL means a committed order survives a power cut,
 * which a till needs more than the last millisecond of write latency.
 */
export function openNodeSqliteDriver(
  path: string,
  synchronous: SynchronousMode = "FULL",
): SqliteDriver {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = ${synchronous};`);
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
    run: (sql, params: readonly SqlValue[] = []) => {
      prepare(sql).run(...params);
    },
    all: (sql, params: readonly SqlValue[] = []) => prepare(sql).all(...params) as SqlRow[],
    close: () => {
      // Folding the WAL back in leaves one self-contained file, which is what gets measured.
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      db.close();
    },
  };
}
