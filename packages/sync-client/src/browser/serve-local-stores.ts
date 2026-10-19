import type { LocalStore } from "../local-store/local-store";
import {
  type WireRequest,
  type WireResponse,
  isLocalStoreMethod,
  toWireError,
} from "./local-store-wire";

/** The Worker's side of the channel: `self` inside a dedicated Worker. */
export interface WorkerScope {
  postMessage(message: WireResponse): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
}

/** A store the Worker answers for, with any extra calls its opener declares. */
export interface HostedStore {
  readonly store: LocalStore;
  readonly extras?: Readonly<Record<string, (...args: never[]) => unknown>>;
}

/**
 * Answers WireRequests inside the Worker. A LocalStore method runs its transaction with no
 * await between BEGIN and COMMIT, and a message is handled only after the previous handler
 * returned, so two messages never interleave inside one transaction.
 */
export function serveLocalStores(
  scope: WorkerScope,
  open: (...args: never[]) => Promise<HostedStore>,
): void {
  const hosted = new Map<number, HostedStore>();
  let nextHandle = 1;

  const dispatch = async ({ handle, method, args }: WireRequest): Promise<unknown> => {
    if (handle === null) {
      if (method !== "open") throw new Error(`unknown call ${method}`);
      const opened = await open(...(args as never[]));
      const id = nextHandle++;
      hosted.set(id, opened);
      return id;
    }
    const entry = hosted.get(handle);
    if (entry === undefined) throw new Error("the store is closed");
    if (isLocalStoreMethod(method)) {
      const call = entry.store[method] as (...callArgs: unknown[]) => Promise<unknown>;
      const value = await call(...args);
      if (method === "close") hosted.delete(handle);
      return value;
    }
    const extra = entry.extras?.[method];
    if (extra === undefined) throw new Error(`unknown call ${method}`);
    return await extra(...(args as never[]));
  };

  scope.addEventListener("message", (event) => {
    const request = event.data as WireRequest;
    dispatch(request).then(
      (value) => scope.postMessage({ id: request.id, ok: true, value }),
      (error: unknown) =>
        scope.postMessage({ id: request.id, ok: false, error: toWireError(error) }),
    );
  });
}
