// The store side of the contract page: the same Worker plumbing and OPFS opening as the
// till's own Worker, plus fresh in-memory databases and fault injection for the cases.
import type { SAHPoolUtil } from "@sqlite.org/sqlite-wasm";
import {
  installOpfsPool,
  loadSqliteWasm,
  openOpfsDatabase,
} from "../../../src/browser/open-opfs-database";
import { type WorkerScope, serveLocalStores } from "../../../src/browser/serve-local-stores";
import { wrapWasmDatabase } from "../../../src/browser/wasm-sqlite-driver";
import {
  type SqlFault,
  matchesFault,
} from "../../../src/local-store/contract/local-store-contract-harness";
import { faultyDriver } from "../../../src/local-store/local-store-fixtures";
import { createSqliteLocalStore } from "../../../src/local-store/sqlite-local-store";

export type ContractWorkerOpen =
  | { readonly kind: "memory"; readonly fault?: SqlFault }
  | { readonly kind: "file"; readonly name: string };

// A pool of its own, so the contract never touches the files of a till open on this origin.
let pool: Promise<SAHPoolUtil> | undefined;

serveLocalStores(self as unknown as WorkerScope, async (open: ContractWorkerOpen) => {
  const inner =
    open.kind === "memory"
      ? wrapWasmDatabase(new (await loadSqliteWasm()).oo1.DB(":memory:"))
      : openOpfsDatabase(await (pool ??= installOpfsPool("fnb-contract-test")), `/${open.name}.db`);
  const fault = open.kind === "memory" ? open.fault : undefined;
  const { driver, control } = faultyDriver(inner, (sql) => matchesFault(fault, sql));
  return {
    store: createSqliteLocalStore(driver),
    extras: {
      setFaultArmed: (armed: boolean) => {
        control.armed = armed;
      },
      querySql: (sql: string) => driver.all(sql),
    },
  };
});
