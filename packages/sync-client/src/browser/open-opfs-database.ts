import sqlite3InitModule, { type SAHPoolUtil, type Sqlite3Static } from "@sqlite.org/sqlite-wasm";
import type { SqliteDriver } from "../local-store/sqlite-driver";
import { BROWSER_STORE_ERROR_CODES, BrowserStoreError } from "./browser-store-errors";
import { wrapWasmDatabase } from "./wasm-sqlite-driver";

let sqlite: Promise<Sqlite3Static> | undefined;

/** The WASM module, compiled once per Worker. */
export const loadSqliteWasm = (): Promise<Sqlite3Static> => (sqlite ??= sqlite3InitModule());

/**
 * The opfs-sahpool VFS: it needs neither SharedArrayBuffer nor COOP/COEP headers, so the
 * POS can be served like any page. It holds its files' access handles for as long as the
 * Worker lives, which is what makes the database one tab's at a time.
 */
export async function installOpfsPool(name: string): Promise<SAHPoolUtil> {
  if (typeof navigator.storage?.getDirectory !== "function") {
    throw new BrowserStoreError(BROWSER_STORE_ERROR_CODES.unsupportedBrowser);
  }
  const sqlite3 = await loadSqliteWasm();
  const pool = await sqlite3.installOpfsSAHPoolVfs({ name });
  // A database in WAL mode takes a slot for itself and one for its log; the rest is room
  // for the journal SQLite opens briefly while switching modes.
  await pool.reserveMinimumCapacity(6);
  return pool;
}

/**
 * Opens `file` the way the till runs it. EXCLUSIVE locking first, because WAL without
 * shared memory (which the VFS lacks) needs it; with it a commit costs ~1 ms instead of the
 * ~5.6 ms of the default rollback journal. FULL: a committed sale survives a crash.
 */
export function openOpfsDatabase(pool: SAHPoolUtil, file: string): SqliteDriver {
  const db = new pool.OpfsSAHPoolDb(file);
  try {
    db.exec("PRAGMA locking_mode = EXCLUSIVE");
    const journal = db.selectValue("PRAGMA journal_mode = WAL");
    if (journal !== "wal") throw new Error(`the database refused WAL (journal_mode=${journal})`);
    db.exec("PRAGMA synchronous = FULL");
  } catch (error) {
    db.close();
    throw error;
  }
  return wrapWasmDatabase(db);
}
