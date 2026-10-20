import type { LocalStore } from "../local-store/local-store";
import { BROWSER_STORE_ERROR_CODES, BrowserStoreError } from "./browser-store-errors";
import {
  LOCAL_STORE_METHODS,
  type WireRequest,
  type WireResponse,
  fromWireError,
} from "./local-store-wire";

/** The page's side of a dedicated Worker, as much of it as the channel needs. */
export interface WorkerPort {
  postMessage(message: WireRequest): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "error", listener: (event: unknown) => void): void;
}

export interface WorkerChannel {
  call(handle: number | null, method: string, args: readonly unknown[]): Promise<unknown>;
}

/** Request/answer over a Worker; once the Worker dies, every call fails with workerFailed. */
export function createWorkerChannel(worker: WorkerPort): WorkerChannel {
  const waiting = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  let nextId = 1;
  let failed = false;
  const workerFailed = () => new BrowserStoreError(BROWSER_STORE_ERROR_CODES.workerFailed);

  worker.addEventListener("message", (event) => {
    const response = event.data as WireResponse;
    const pending = waiting.get(response.id);
    if (pending === undefined) return;
    waiting.delete(response.id);
    if (response.ok) pending.resolve(response.value);
    else pending.reject(fromWireError(response.error));
  });
  // A Worker that failed to load or threw at the top level answers nothing again: without
  // this the till would wait forever on a sale that was never written.
  worker.addEventListener("error", () => {
    failed = true;
    for (const pending of waiting.values()) pending.reject(workerFailed());
    waiting.clear();
  });

  return {
    call(handle, method, args) {
      if (failed) return Promise.reject(workerFailed());
      const id = nextId++;
      return new Promise((resolve, reject) => {
        waiting.set(id, { resolve, reject });
        worker.postMessage({ id, handle, method, args: [...args] });
      });
    },
  };
}

/** A LocalStore whose every method is one message to the store `handle` in the Worker. */
export function remoteLocalStore(channel: WorkerChannel, handle: number): LocalStore {
  const methods = Object.fromEntries(
    LOCAL_STORE_METHODS.map((method) => [
      method,
      (...args: unknown[]) => channel.call(handle, method, args),
    ]),
  );
  return methods as unknown as LocalStore;
}
