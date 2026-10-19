import type { BindingSpec, Database, PreparedStatement } from "@sqlite.org/sqlite-wasm";
import type { SqlRow, SqlValue, SqliteDriver } from "../local-store/sqlite-driver";

/**
 * The SQLite WASM side of the driver seam. Statements are cached like node:sqlite's, and
 * every use ends with reset(true) so a thrown step never leaves a statement holding a read
 * lock that would make the next BEGIN IMMEDIATE fail with SQLITE_BUSY.
 */
export function wrapWasmDatabase(db: Database): SqliteDriver {
  const statements = new Map<string, PreparedStatement>();
  const prepare = (sql: string): PreparedStatement => {
    let statement = statements.get(sql);
    if (statement === undefined) {
      statement = db.prepare(sql);
      statements.set(sql, statement);
    }
    return statement;
  };
  const bound = (sql: string, params: readonly SqlValue[]): PreparedStatement => {
    const statement = prepare(sql);
    if (params.length > 0) statement.bind(params as unknown as BindingSpec);
    return statement;
  };
  return {
    exec: (sql) => {
      db.exec(sql);
    },
    run: (sql, params: readonly SqlValue[] = []) => {
      const statement = bound(sql, params);
      try {
        statement.step();
      } finally {
        statement.reset(true);
      }
    },
    all: (sql, params: readonly SqlValue[] = []) => {
      const statement = bound(sql, params);
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
