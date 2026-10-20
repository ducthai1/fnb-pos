import type { SyncCommandEnvelope } from "@fnb/contracts";
import type {
  EntityRef,
  EntityView,
  LocalCommand,
  LocalStore,
  RejectedCommand,
  RestoreState,
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
  /**
   * How long the till keeps commands the server answered: what it can send again when the
   * server is restored from a backup. It must cover the time between two backups.
   */
  journalRetentionMs?: number;
}

/** A week: backups run nightly, and a restore goes back to the last good one. */
export const DEFAULT_JOURNAL_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/** Pruning the journal is housekeeping: once an hour is plenty. */
const JOURNAL_PRUNE_EVERY_MS = 60 * 60 * 1000;

/** More than a till holds even after days offline; the outbox has no other bound. */
const ALL_PENDING = 1_000_000;

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
  /** Every command still waiting for the server's answer, in deviceSeq order. */
  pendingCommands(): Promise<SyncCommandEnvelope[]>;
  /** After the server was restored from a backup: what the till still has to send again. */
  restoreState(): Promise<RestoreState>;
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
    now: () => new Date(clock.now()).toISOString(),
  };
  const retentionMs = options.journalRetentionMs ?? DEFAULT_JOURNAL_RETENTION_MS;
  let prunedAt = Number.NEGATIVE_INFINITY;
  const pruneJournal = async () => {
    const now = clock.now();
    if (now - prunedAt < JOURNAL_PRUNE_EVERY_MS) return;
    prunedAt = now;
    await store.pruneJournal(
      new Date(now).toISOString(),
      new Date(now - retentionMs).toISOString(),
    );
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
    await pruneJournal();
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
    pendingCommands: () => store.pendingCommands(ALL_PENDING),
    restoreState: () => store.restoreState(),
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
