import type { BackoffPolicy, LocalStore, SyncTransport } from "@fnb/sync-client";
import { BROWSER_STORE_ERROR_CODES, isBrowserStoreError } from "@fnb/sync-client/browser";
import type { PosApi } from "../features/api/pos-api";
import type { BootstrapSource } from "../features/bootstrap/bootstrap-source";
import type { FloorSource } from "../features/floor/floor-occupancy";
import type { PrinterPort } from "../features/printing/printer-port";
import type { BlockReason } from "../screens/blocked/blocked-screen";
import type {
  DeviceCredential,
  DeviceCredentialStore,
} from "../shell-bridge/device-credential-store";

/** Everything the POS reaches outside itself; tests pass fakes of the server parts only. */
export interface PosDependencies {
  /** Opened once per page load, outside React, so no re-render can open it a second time. */
  readonly store: Promise<LocalStore>;
  readonly credentials: DeviceCredentialStore;
  readonly api: PosApi;
  readonly bootstrap: BootstrapSource;
  /** The branch's floor plan and who sits where, read for the floor screen. */
  readonly floor: FloorSource;
  transportFor(credential: DeviceCredential, staffSessionToken: () => string | null): SyncTransport;
  readonly syncIdleMs: number;
  /** The wait after failed passes; the sync client's own unless a test needs it short. */
  readonly syncBackoff?: BackoffPolicy;
  /** The till's printers: the native shell's, or the web build's preview-only stand-in. */
  readonly printer: PrinterPort;
  reload(): void;
  /** The code of the pairing link the till was opened with, already out of the address bar. */
  linkedPairingCode?: string | null;
}

export function blockReasonOf(error: unknown): BlockReason {
  if (!isBrowserStoreError(error)) return "failed";
  if (error.code === BROWSER_STORE_ERROR_CODES.openInAnotherTab) return "another_tab";
  if (error.code === BROWSER_STORE_ERROR_CODES.unsupportedBrowser) return "unsupported";
  return "failed";
}
