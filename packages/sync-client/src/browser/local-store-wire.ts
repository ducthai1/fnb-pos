import type { LocalStore } from "../local-store/local-store";
import {
  SYNC_CLIENT_ERROR_CODES,
  SyncClientError,
  type SyncClientErrorCode,
} from "../sync-client-error";
import { BrowserStoreError, isBrowserStoreErrorCode } from "./browser-store-errors";

/**
 * One call to the database Worker. `handle` names an opened store; null addresses the
 * Worker itself (only "open"). Each store call is one LocalStore method and so one whole
 * transaction inside the Worker: no transaction ever spans two messages.
 */
export interface WireRequest {
  readonly id: number;
  readonly handle: number | null;
  readonly method: string;
  readonly args: readonly unknown[];
}

export interface WireError {
  readonly name: string;
  readonly message: string;
  readonly code?: string;
}

export type WireResponse =
  | { readonly id: number; readonly ok: true; readonly value: unknown }
  | { readonly id: number; readonly ok: false; readonly error: WireError };

/** The LocalStore methods a Worker answers; anything else must be a declared extra. */
export const LOCAL_STORE_METHODS = [
  "bindDevice",
  "enqueue",
  "pendingCommands",
  "pendingCount",
  "recordResults",
  "applyChanges",
  "cursor",
  "snapshot",
  "snapshots",
  "rejectedCommands",
  "serverGeneration",
  "adoptServerGeneration",
  "rebaseOntoGeneration",
  "dropCopiesTheServerLost",
  "restoreState",
  "pruneJournal",
  "close",
] as const satisfies readonly (keyof LocalStore)[];

export type LocalStoreMethod = (typeof LOCAL_STORE_METHODS)[number];

export const isLocalStoreMethod = (method: string): method is LocalStoreMethod =>
  (LOCAL_STORE_METHODS as readonly string[]).includes(method);

const isSyncClientCode = (code: unknown): code is SyncClientErrorCode =>
  (Object.values(SYNC_CLIENT_ERROR_CODES) as unknown[]).includes(code);

export function toWireError(error: unknown): WireError {
  if (error instanceof SyncClientError || error instanceof BrowserStoreError) {
    return { name: error.name, message: error.message, code: error.code };
  }
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: "Error", message: String(error) };
}

/**
 * Rebuilds the error on the page's side of the Worker. The sync loop tells a refusal it
 * can back off from (SyncClientError) by class, so the class has to survive the message.
 */
export function fromWireError(wire: WireError): Error {
  if (wire.name === "SyncClientError" && isSyncClientCode(wire.code)) {
    return new SyncClientError(wire.code);
  }
  if (wire.name === "BrowserStoreError" && isBrowserStoreErrorCode(wire.code)) {
    return new BrowserStoreError(wire.code);
  }
  const error = new Error(wire.message);
  error.name = wire.name;
  return error;
}
