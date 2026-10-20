import type { LocalStore, SyncTransport } from "@fnb/sync-client";
import { BROWSER_STORE_ERROR_CODES, isBrowserStoreError } from "@fnb/sync-client/browser";
import type { PosApi } from "../features/api/pos-api";
import type { BootstrapSource } from "../features/bootstrap/bootstrap-source";
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
  transportFor(credential: DeviceCredential, staffSessionToken: () => string | null): SyncTransport;
  readonly syncIdleMs: number;
  reload(): void;
}

export function blockReasonOf(error: unknown): BlockReason {
  if (!isBrowserStoreError(error)) return "failed";
  if (error.code === BROWSER_STORE_ERROR_CODES.openInAnotherTab) return "another_tab";
  if (error.code === BROWSER_STORE_ERROR_CODES.unsupportedBrowser) return "unsupported";
  return "failed";
}
