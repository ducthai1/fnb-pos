/** Time as the sync loop sees it; tests pass a virtual one so a backoff never really waits. */
export interface SyncClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemSyncClock: SyncClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface BackoffPolicy {
  readonly baseMs: number;
  readonly maxMs: number;
}

export const DEFAULT_BACKOFF: BackoffPolicy = { baseMs: 500, maxMs: 30_000 };

/**
 * The wait after the `failures`-th failure in a row: doubling from baseMs up to maxMs, half
 * of it fixed and half random. Without the random half every till of a shop retries in
 * lockstep the moment the router comes back.
 */
export function backoffDelayMs(
  policy: BackoffPolicy,
  failures: number,
  random: () => number,
): number {
  const ceiling = Math.min(policy.maxMs, policy.baseMs * 2 ** Math.min(failures - 1, 30));
  return Math.round(ceiling / 2 + (random() * ceiling) / 2);
}
