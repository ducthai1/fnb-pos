import { BROWSER_STORE_ERROR_CODES, BrowserStoreError } from "./browser-store-errors";

export interface HeldLock {
  release(): void;
}

/**
 * Takes the Web Lock `name` or fails at once with openInAnotherTab. The lock is held until
 * release() or until the Worker holding it ends (its tab closed), so a crashed tab never
 * keeps the till locked out.
 */
export async function holdSingleTabLock(
  name: string,
  locks: LockManager | undefined = globalThis.navigator?.locks,
): Promise<HeldLock> {
  if (locks === undefined)
    throw new BrowserStoreError(BROWSER_STORE_ERROR_CODES.unsupportedBrowser);
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const granted = await new Promise<boolean>((resolve, reject) => {
    locks
      .request(name, { ifAvailable: true }, async (lock) => {
        resolve(lock !== null);
        if (lock !== null) await released;
      })
      .catch(reject);
  });
  if (!granted) throw new BrowserStoreError(BROWSER_STORE_ERROR_CODES.openInAnotherTab);
  return { release };
}
