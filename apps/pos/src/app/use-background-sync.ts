import { type LocalStore, type SyncClient, createSyncClient } from "@fnb/sync-client";
import { type RefObject, useEffect, useState } from "react";
import { type BackgroundSync, startBackgroundSync } from "../features/sync/background-sync-loop";
import type { DeviceCredential } from "../shell-bridge/device-credential-store";
import type { PosDependencies } from "./pos-dependencies";

export interface RunningTill {
  readonly client: SyncClient;
  readonly sync: BackgroundSync;
}

/**
 * One sync client and loop for the paired till while the POS is open. The staff token is
 * read per push from the ref, so signing someone else in needs no new loop.
 */
export function useBackgroundSync(
  deps: PosDependencies,
  store: LocalStore,
  credential: DeviceCredential,
  staffToken: RefObject<string | null>,
): RunningTill | null {
  const [till, setTill] = useState<RunningTill | null>(null);
  useEffect(() => {
    const client = createSyncClient({
      store,
      transport: deps.transportFor(credential, () => staffToken.current),
      deviceId: credential.deviceId,
    });
    const sync = startBackgroundSync({ client, idleMs: deps.syncIdleMs });
    setTill({ client, sync });
    return () => sync.stop();
  }, [deps, store, credential, staffToken]);
  return till;
}
