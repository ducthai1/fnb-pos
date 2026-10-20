import type { BindingSpec, Database, PreparedStatement } from "@sqlite.org/sqlite-wasm";
import type { SqlRow, SqlValue, SqliteDriver } from "../local-store/sqlite-driver";

/**
 * SQLite WASM behind the same driver seam as node:sqlite, so the store runs its SQL
 * unchanged. Statements are cached, and every use ends with reset(true): a step that threw
 * must not leave a statement holding a read lock that makes the next BEGIN IMMEDIATE fail
 * with SQLITE_BUSY.
 */
export function wrapWasmDatabase(db: Database): SqliteDriver {
  const statements = new Map<string, PreparedStatement>();
  const prepared = (sql: string, params: readonly SqlValue[]): PreparedStatement => {
    let statement = statements.get(sql);
    if (statement === undefined) {
      statement = db.prepare(sql);
      statements.set(sql, statement);
    }
    if (params.length > 0) statement.bind(params as unknown as BindingSpec);
    return statement;
  };
  return {
    exec: (sql) => {
      db.exec(sql);
    },
    run: (sql, params = []) => {
      const statement = prepared(sql, params);
      try {
        statement.step();
      } finally {
        statement.reset(true);
      }
      return db.changes();
    },
    all: (sql, params = []) => {
      const statement = prepared(sql, params);
      const rows: SqlRow[] = [];
      try {
        while (statement.step()) rows.push(statement.get({}) as SqlRow);
      } finally {
        statement.reset(true);
      }
      return rows;
    },
    close: () => {
      for (const statement of statements.values()) statement.finalize();
      statements.clear();
      db.close();
    },
  };
}
