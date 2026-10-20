// Runs the LocalStore contract against SQLite WASM in a Worker, every call crossing the
// message channel the POS uses, and leaves the results on window for the Node side.
import {
  createWorkerChannel,
  remoteLocalStore,
} from "../../../src/browser/worker-local-store-client";
import {
  type ContractStore,
  LOCAL_STORE_CONTRACT,
  type LocalStoreHarness,
  contractCaseId,
} from "../../../src/local-store/contract/local-store-contract";
import { assertEqual } from "../../../src/local-store/contract/contract-assert";
import type { SqlRow } from "../../../src/local-store/sqlite-driver";
import {
  type BrowserCaseResult,
  type ContractPageRun,
  OPFS_PRAGMAS_CASE,
} from "../browser-page-results";
import type { ContractWorkerOpen } from "./contract-test-worker";

const worker = new Worker(new URL("./contract-test-worker.ts", import.meta.url), {
  type: "module",
});
const channel = createWorkerChannel(worker);

async function opened(open: ContractWorkerOpen): Promise<ContractStore> {
  const handle = (await channel.call(null, "open", [open])) as number;
  return {
    store: remoteLocalStore(channel, handle),
    setFaultArmed: async (armed) => {
      await channel.call(handle, "setFaultArmed", [armed]);
    },
    querySql: async (sql) => (await channel.call(handle, "querySql", [sql])) as SqlRow[],
  };
}

const harness: LocalStoreHarness = {
  open: (options = {}) =>
    opened(
      options.fault === undefined ? { kind: "memory" } : { kind: "memory", fault: options.fault },
    ),
  openFile: (name) => opened({ kind: "file", name }),
};

async function outcome(id: string, work: () => Promise<void>): Promise<BrowserCaseResult> {
  try {
    await work();
    return { id, ok: true };
  } catch (error) {
    return {
      id,
      ok: false,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  }
}

async function run(): Promise<BrowserCaseResult[]> {
  const results: BrowserCaseResult[] = [];
  for (const group of LOCAL_STORE_CONTRACT) {
    for (const contractCase of group.cases) {
      results.push(
        await outcome(contractCaseId(group, contractCase.name), () => contractCase.run(harness)),
      );
    }
  }
  results.push(
    await outcome(OPFS_PRAGMAS_CASE, async () => {
      const db = await harness.openFile(`pragmas-${crypto.randomUUID()}`);
      const [journal] = await db.querySql("PRAGMA journal_mode");
      const [locking] = await db.querySql("PRAGMA locking_mode");
      const [synchronous] = await db.querySql("PRAGMA synchronous");
      assertEqual(journal?.journal_mode, "wal", "journal_mode");
      assertEqual(locking?.locking_mode, "exclusive", "locking_mode");
      assertEqual(synchronous?.synchronous, 2, "synchronous");
      await db.store.close();
    }),
  );
  return results;
}

void run().then((results) => {
  const done: ContractPageRun = { results };
  (window as unknown as { __contractRun: ContractPageRun }).__contractRun = done;
});
