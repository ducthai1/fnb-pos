/** Why the till's database could not be opened in this browser tab; the POS shows each. */
export const BROWSER_STORE_ERROR_CODES = {
  /**
   * Another tab of the POS holds the database. The opfs-sahpool VFS keeps exclusive file
   * handles, so a second tab could not open it anyway; a lock says so plainly, up front.
   */
  openInAnotherTab: "SYNC_CLIENT_OPEN_IN_ANOTHER_TAB",
  /** No Web Locks or no Origin Private File System: the browser cannot keep sales offline. */
  unsupportedBrowser: "SYNC_CLIENT_BROWSER_UNSUPPORTED",
  /** The database Worker died; every later call fails until the POS is reloaded. */
  workerFailed: "SYNC_CLIENT_WORKER_FAILED",
} as const;

export type BrowserStoreErrorCode =
  (typeof BROWSER_STORE_ERROR_CODES)[keyof typeof BROWSER_STORE_ERROR_CODES];

export class BrowserStoreError extends Error {
  constructor(readonly code: BrowserStoreErrorCode) {
    super(code);
    this.name = "BrowserStoreError";
  }
}

export const isBrowserStoreError = (error: unknown): error is BrowserStoreError =>
  error instanceof BrowserStoreError;

export const isBrowserStoreErrorCode = (code: unknown): code is BrowserStoreErrorCode =>
  (Object.values(BROWSER_STORE_ERROR_CODES) as unknown[]).includes(code);
