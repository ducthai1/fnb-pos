import {
  type LocalStore,
  type SyncClient,
  type SyncTransport,
  SyncTransportError,
  createSyncClient,
} from "@fnb/sync-client";
import { type RefObject, useEffect, useRef, useState } from "react";
import { type BackgroundSync, startBackgroundSync } from "../features/sync/background-sync-loop";
import type { DeviceCredential } from "../shell-bridge/device-credential-store";
import type { PosDependencies } from "./pos-dependencies";

export interface RunningTill {
  readonly client: SyncClient;
  readonly sync: BackgroundSync;
}

/**
 * The transport, telling of a push the server answered 401 for the staff token it carried:
 * that session is over (expired, or its staff member switched off), and only that one, so a
 * newer sign-in is never thrown out by an answer about the session before it.
 */
function watchingStaffSession(
  transport: SyncTransport,
  staffToken: RefObject<string | null>,
  onRefused: (token: string) => void,
): SyncTransport {
  return {
    pullChanges: (cursor, limit) => transport.pullChanges(cursor, limit),
    async pushCommands(batch) {
      const token = staffToken.current;
      try {
        return await transport.pushCommands(batch);
      } catch (error) {
        const refused = error instanceof SyncTransportError && error.status === 401;
        if (refused && token !== null) onRefused(token);
        throw error;
      }
    },
  };
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
  onStaffSessionRefused: (token: string) => void = () => {},
): RunningTill | null {
  const [till, setTill] = useState<RunningTill | null>(null);
  const refusedNow = useRef(onStaffSessionRefused);
  refusedNow.current = onStaffSessionRefused;
  useEffect(() => {
    const transport = deps.transportFor(credential, () => staffToken.current);
    const client = createSyncClient({
      store,
      transport: watchingStaffSession(transport, staffToken, (token) => refusedNow.current(token)),
      deviceId: credential.deviceId,
    });
    const sync = startBackgroundSync({ client, idleMs: deps.syncIdleMs });
    setTill({ client, sync });
    return () => sync.stop();
  }, [deps, store, credential, staffToken]);
  return till;
}
