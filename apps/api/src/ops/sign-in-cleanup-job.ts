import { type PurgeReport, compactChangeLog, purgeExpiredCodesAndSessions } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import type { Clock } from "../clock";

export interface CleanupSettings {
  /** Time between two rounds; the first runs as the server starts. */
  readonly intervalMillis: number;
  /** How long an expired session is kept, for whoever looks into a sign-in afterwards. */
  readonly sessionRetentionMillis: number;
  /**
   * How old a copy in the change feed must be before it may go, once a newer copy of the
   * same row has replaced it.
   */
  readonly changeLogCompactAfterMillis: number;
}

/** What one round removed. */
export interface CleanupReport extends PurgeReport {
  /** Copies of the change feed a newer copy of the same row replaced. */
  readonly changeLogRows: number;
}

// Short transactions while tills pull and write; a run removes at most this many per tenant
// (the next run, an interval later, carries on).
const CHANGE_LOG_BATCH = 500;
const CHANGE_LOG_BATCHES_PER_TENANT = 200;

export interface CleanupDependencies {
  readonly pool: pg.Pool;
  readonly clock: Clock;
  readonly settings: CleanupSettings;
  readonly onRound?: (report: CleanupReport) => void;
  readonly onError?: (error: unknown) => void;
}

export interface CleanupJob {
  /** Waits for a round in progress, then schedules no more. */
  stop(): Promise<void>;
}

/**
 * One round: pairing codes that have expired, and sessions (backoffice and staff) that
 * expired more than the retention ago, then the change feed's old copies that a newer copy
 * of the same row replaced. Expired rows are already refused at sign-in, and a till pulling
 * from any cursor still gets the newest copy of each row; this only keeps the tables from
 * growing for ever.
 */
export async function runCleanupRound(dependencies: CleanupDependencies): Promise<CleanupReport> {
  const now = dependencies.clock.now().getTime();
  const { settings, pool } = dependencies;
  const purged = await purgeExpiredCodesAndSessions(pool, {
    codesExpiredBefore: new Date(now),
    sessionsExpiredBefore: new Date(now - settings.sessionRetentionMillis),
  });
  const compacted = await compactChangeLog(pool, {
    olderThan: new Date(now - settings.changeLogCompactAfterMillis),
    batchSize: CHANGE_LOG_BATCH,
    maxBatchesPerTenant: CHANGE_LOG_BATCHES_PER_TENANT,
  });
  return { ...purged, changeLogRows: compacted.changeLogRows };
}

/** Runs a round now and then every interval, one at a time, until stopped. */
export function startCleanupJob(dependencies: CleanupDependencies): CleanupJob {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let running: Promise<void> = Promise.resolve();
  const round = async () => {
    try {
      dependencies.onRound?.(await runCleanupRound(dependencies));
    } catch (error) {
      dependencies.onError?.(error);
    }
    if (stopped) return;
    timer = setTimeout(() => (running = round()), dependencies.settings.intervalMillis);
    timer.unref();
  };
  running = round();
  return {
    stop: async () => {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      await running;
    },
  };
}

/** Starts the job when the app is ready and stops it, finishing its round, on close. */
export function installCleanupJob(app: FastifyInstance, dependencies: CleanupDependencies): void {
  let job: CleanupJob | null = null;
  app.addHook("onReady", async () => {
    job = startCleanupJob(dependencies);
  });
  app.addHook("onClose", async () => {
    await job?.stop();
  });
}
