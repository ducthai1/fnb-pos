import type { SyncClient } from "@fnb/sync-client";
import { INITIAL_SYNC_STATUS, type TillSyncStatus, connectionAfter } from "./till-sync-status";

export interface BackgroundSync {
  current(): TillSyncStatus;
  /** For useSyncExternalStore: called after every change of current(). */
  subscribe(listener: () => void): () => void;
  /** Runs the next pass now instead of after the idle wait, e.g. right after a sale. */
  nudge(): void;
  stop(): void;
}

export interface BackgroundSyncOptions {
  client: SyncClient;
  /** Pause between passes once the till has nothing more to send or pull. */
  idleMs: number;
  /** A pass that threw: the local database failed, not the network (that is reported). */
  onPassError?: (error: unknown) => void;
}

/**
 * Syncs for as long as the POS is open: one pass, a pause, the next pass. The client waits
 * out its own backoff after a failure, so the loop never hammers a server that is down.
 */
export function startBackgroundSync(options: BackgroundSyncOptions): BackgroundSync {
  const { client, idleMs } = options;
  const listeners = new Set<() => void>();
  let status: TillSyncStatus = INITIAL_SYNC_STATUS;
  let stopped = false;
  let wake: (() => void) | null = null;
  let nudgedDuringPass = false;

  const publish = (next: Partial<TillSyncStatus>) => {
    if (stopped) return;
    status = { ...status, ...next };
    for (const listener of listeners) listener();
  };
  const counts = async () => ({
    pending: await client.pendingCount(),
    needsAttention: (await client.rejectedCommands()).length,
    restore: await client.restoreState(),
  });
  const idle = () =>
    new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        wake = null;
        resolve();
      };
      const timer = setTimeout(done, idleMs);
      wake = done;
    });

  async function loop() {
    while (!stopped) {
      try {
        const report = await client.syncOnce();
        publish({ connection: connectionAfter(report), ...(await counts()) });
      } catch (error) {
        (options.onPassError ?? console.error)(error);
      }
      if (nudgedDuringPass) nudgedDuringPass = false;
      else if (!stopped) await idle();
    }
  }

  const nudge = () => {
    if (wake === null) nudgedDuringPass = true;
    else wake();
  };
  // A command recorded on the till shows in the counts at once, and goes out on the next pass.
  const unsubscribe = client.onChange(() => {
    void counts().then(publish, options.onPassError ?? console.error);
    nudge();
  });
  void loop();

  return {
    current: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    nudge,
    stop() {
      stopped = true;
      unsubscribe();
      wake?.();
    },
  };
}
