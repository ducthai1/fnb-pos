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
import { type TillStaffSessions, forgetToken, tokenForBatch } from "./till-staff-sessions";

export interface RunningTill {
  readonly client: SyncClient;
  readonly sync: BackgroundSync;
}

/**
 * The transport, pushing each batch (one staff session's commands) under that session's
 * credential, and telling of a push the server answered 401 for the credential it carried:
 * that session is over (expired, or its staff member switched off), and only that one, so a
 * newer sign-in is never thrown out by an answer about the session before it.
 */
function pushingUnderEachSession(
  deps: PosDependencies,
  credential: DeviceCredential,
  sessions: RefObject<TillStaffSessions>,
  onRefused: (token: string) => void,
): SyncTransport {
  let pushing: string | null = null;
  const transport = deps.transportFor(credential, () => pushing);
  return {
    pullChanges: (cursor, limit) => transport.pullChanges(cursor, limit),
    deviceState: () => transport.deviceState(),
    async pushCommands(batch) {
      const token = tokenForBatch(sessions.current, batch);
      pushing = token;
      try {
        return await transport.pushCommands(batch);
      } catch (error) {
        const refused = error instanceof SyncTransportError && error.status === 401;
        if (refused && token !== null) {
          forgetToken(sessions.current, token);
          onRefused(token);
        }
        throw error;
      }
    },
  };
}

/** The client, stamping every command it records with the session of who is signed in. */
function stampingTheSession(client: SyncClient, sessions: RefObject<TillStaffSessions>) {
  const stamped: SyncClient = {
    ...client,
    enqueue(command) {
      const sessionId = sessions.current.current?.sessionId ?? null;
      const stamp = command.staffSessionId === undefined && sessionId !== null;
      return client.enqueue(stamp ? { ...command, staffSessionId: sessionId } : command);
    },
  };
  return stamped;
}

/**
 * One sync client and loop for the paired till while the POS is open. The sessions are
 * read per command and per push from the ref, so signing someone else in needs no new loop.
 */
export function useBackgroundSync(
  deps: PosDependencies,
  store: LocalStore,
  credential: DeviceCredential,
  sessions: RefObject<TillStaffSessions>,
  onStaffSessionRefused: (token: string) => void = () => {},
): RunningTill | null {
  const [till, setTill] = useState<RunningTill | null>(null);
  const refusedNow = useRef(onStaffSessionRefused);
  refusedNow.current = onStaffSessionRefused;
  useEffect(() => {
    const refused = (token: string) => refusedNow.current(token);
    const client = stampingTheSession(
      createSyncClient({
        store,
        transport: pushingUnderEachSession(deps, credential, sessions, refused),
        deviceId: credential.deviceId,
      }),
      sessions,
    );
    const sync = startBackgroundSync({ client, idleMs: deps.syncIdleMs });
    setTill({ client, sync });
    return () => sync.stop();
  }, [deps, store, credential, sessions]);
  return till;
}
