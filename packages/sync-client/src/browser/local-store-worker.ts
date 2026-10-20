// The till's database Worker: SQLite WASM on OPFS, answering LocalStore calls by message.
import { createSqliteLocalStore } from "../local-store/sqlite-local-store";
import { installOpfsPool, openOpfsDatabase } from "./open-opfs-database";
import { type WorkerScope, serveLocalStores } from "./serve-local-stores";
import { holdSingleTabLock } from "./single-tab-lock";

/** The OPFS directory of the POS's databases; tests use pools of their own. */
const POOL_NAME = "fnb-pos";

export interface OpenTillDatabase {
  /** The database's name inside the pool, e.g. "/till.db". */
  readonly file: string;
}

serveLocalStores(self as unknown as WorkerScope, async ({ file }: OpenTillDatabase) => {
  // The lock comes first: a second tab must hear "open elsewhere" before it touches the
  // pool, whose access handles would otherwise fail it with an error nobody can read.
  const lock = await holdSingleTabLock(`fnb-pos-local-database:${file}`);
  try {
    const store = createSqliteLocalStore(openOpfsDatabase(await installOpfsPool(POOL_NAME), file));
    return {
      store: {
        ...store,
        close: async () => {
          await store.close();
          lock.release();
        },
      },
    };
  } catch (error) {
    lock.release();
    throw error;
  }
});
