import type { LocalStore } from "../local-store/local-store";
import type { OpenTillDatabase } from "./local-store-worker";
import { createWorkerChannel, remoteLocalStore } from "./worker-local-store-client";

export interface BrowserLocalStoreOptions {
  /** The database inside the POS's OPFS pool; one till database per origin by default. */
  readonly file?: string;
}

/**
 * The till's LocalStore in a browser: SQLite WASM on OPFS inside a dedicated Worker, so a
 * commit's file I/O never blocks the screen. Fails with BrowserStoreError openInAnotherTab
 * when another tab has the POS open. close() ends the Worker and frees the database.
 */
export async function openBrowserLocalStore(
  options: BrowserLocalStoreOptions = {},
): Promise<LocalStore> {
  // Written out in full here so Vite can see the Worker and bundle it with its WASM.
  const worker = new Worker(new URL("./local-store-worker.ts", import.meta.url), {
    type: "module",
    name: "fnb-local-store",
  });
  const channel = createWorkerChannel(worker);
  const open: OpenTillDatabase = { file: options.file ?? "/till.db" };
  try {
    const handle = (await channel.call(null, "open", [open])) as number;
    const store = remoteLocalStore(channel, handle);
    return {
      ...store,
      close: async () => {
        try {
          await store.close();
        } finally {
          worker.terminate();
        }
      },
    };
  } catch (error) {
    worker.terminate();
    throw error;
  }
}
