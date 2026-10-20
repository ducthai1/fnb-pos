import { type PurgeReport, purgeExpiredCodesAndSessions } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import type { Clock } from "../clock";

export interface CleanupSettings {
  /** Time between two rounds; the first runs as the server starts. */
  readonly intervalMillis: number;
  /** How long an expired session is kept, for whoever looks into a sign-in afterwards. */
  readonly sessionRetentionMillis: number;
}

export interface CleanupDependencies {
  readonly pool: pg.Pool;
  readonly clock: Clock;
  readonly settings: CleanupSettings;
  readonly onRound?: (report: PurgeReport) => void;
  readonly onError?: (error: unknown) => void;
}

export interface CleanupJob {
  /** Waits for a round in progress, then schedules no more. */
  stop(): Promise<void>;
}

/**
 * One round: pairing codes that have expired, and sessions (backoffice and staff) that
 * expired more than the retention ago. Expired rows are already refused at sign-in; this
 * only keeps the tables from growing for ever.
 */
export function runCleanupRound(dependencies: CleanupDependencies): Promise<PurgeReport> {
  const now = dependencies.clock.now().getTime();
  return purgeExpiredCodesAndSessions(dependencies.pool, {
    codesExpiredBefore: new Date(now),
    sessionsExpiredBefore: new Date(now - dependencies.settings.sessionRetentionMillis),
  });
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
