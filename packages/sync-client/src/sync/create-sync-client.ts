import type { SyncCommandEnvelope } from "@fnb/contracts";
import type {
  EntityRef,
  EntityView,
  LocalCommand,
  LocalStore,
  RejectedCommand,
} from "../local-store/local-store";
import {
  type BackoffPolicy,
  DEFAULT_BACKOFF,
  type SyncClock,
  backoffDelayMs,
  systemSyncClock,
} from "./sync-clock";
import { type SyncPassContext, pullToEnd, pushOneBatch } from "./sync-pass";
import { type SyncReport, emptyReport } from "./sync-report";
import type { SyncTransport } from "./sync-transport";

export interface SyncClientOptions {
  store: LocalStore;
  transport: SyncTransport;
  /** The paired till; its database is refused if it was another till's. */
  deviceId: string;
  clock?: SyncClock;
  /** For the backoff's random half; Math.random unless a test pins it. */
  random?: () => number;
  backoff?: BackoffPolicy;
  /** Commands per push; the server takes at most 100. */
  batchSize?: number;
  /** Changes per pulled page; the server sends at most 1000. */
  pullLimit?: number;
  maxPullPages?: number;
}

export type ChangeListener = (changed: readonly EntityRef[]) => void;

export interface SyncClient {
  /** Records a command and the till's expectation of its row; it is sent on a later pass. */
  enqueue(command: LocalCommand): Promise<SyncCommandEnvelope>;
  /** One push of the oldest batch, then a pull to the feed's end; never two at once. */
  syncOnce(): Promise<SyncReport>;
  snapshot(entity: string, entityId: string): Promise<EntityView | null>;
  snapshots(entity: string): Promise<EntityView[]>;
  rejectedCommands(): Promise<RejectedCommand[]>;
  pendingCount(): Promise<number>;
  /** Called after a write that changed what some rows show; returns the unsubscribe. */
  onChange(listener: ChangeListener): () => void;
}

export function createSyncClient(options: SyncClientOptions): SyncClient {
  const { store } = options;
  const clock = options.clock ?? systemSyncClock;
  const random = options.random ?? Math.random;
  const policy = options.backoff ?? DEFAULT_BACKOFF;
  const listeners = new Set<ChangeListener>();
  const emit = (changed: readonly EntityRef[]) => {
    if (changed.length === 0) return;
    for (const listener of listeners) {
      // A broken screen must not stop the till from syncing: the write is committed anyway.
      try {
        listener(changed);
      } catch {
        // The listener's own error handling is the screen's job.
      }
    }
  };
  const context: SyncPassContext = {
    store,
    transport: options.transport,
    batchSize: options.batchSize ?? 50,
    pullLimit: options.pullLimit ?? 500,
    maxPullPages: options.maxPullPages ?? 10,
    emit,
  };
  let bound: Promise<void> | null = null;
  const bind = () => (bound ??= store.bindDevice(options.deviceId));
  let failures = 0;
  let retryAt = 0;
  let running: Promise<SyncReport> | null = null;

  async function pass(): Promise<SyncReport> {
    await bind();
    const wait = retryAt - clock.now();
    if (wait > 0) await clock.sleep(wait);
    const report = emptyReport();
    const pushFailure = await pushOneBatch(context, report);
    // Pulled even when the push failed or commands are still pending (see pullToEnd).
    const pullFailure = await pullToEnd(context, report);
    report.failure = pushFailure ?? pullFailure;
    report.pending = await store.pendingCount();
    if (report.failure === null) {
      failures = 0;
    } else {
      failures += 1;
      retryAt = clock.now() + backoffDelayMs(policy, failures, random);
    }
    return report;
  }

  return {
    async enqueue(command) {
      await bind();
      const recorded = await store.enqueue(command);
      emit(recorded.changed);
      return recorded.command;
    },
    syncOnce() {
      running ??= pass().finally(() => {
        running = null;
      });
      return running;
    },
    snapshot: (entity, entityId) => store.snapshot(entity, entityId),
    snapshots: (entity) => store.snapshots(entity),
    rejectedCommands: () => store.rejectedCommands(),
    pendingCount: () => store.pendingCount(),
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
