import type { Clock } from "../clock";

/** At most `limit` requests per key within each window of `windowMillis`. */
export interface RateLimit {
  readonly limit: number;
  readonly windowMillis: number;
}

export type RateDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly retryAfterSeconds: number };

interface Window {
  readonly endsAt: number;
  count: number;
}

/** Enough for every address and account of a busy day; past it the oldest are forgotten. */
const DEFAULT_MAX_KEYS = 50_000;

/**
 * Fixed-window request counters, kept in this process's memory. A window opens with the
 * first request of a key and lasts `windowMillis`; a refused request is not counted, so a
 * client that keeps knocking is let in again as soon as its window ends.
 *
 * Limits of this design, accepted for a single API process: counters restart with the
 * process, and two processes behind one proxy each allow the full limit (a deployment of
 * several processes needs a shared store such as Postgres or Redis instead). A client may
 * also send up to twice the limit across the edge of two windows.
 */
export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly clock: Clock,
    private readonly maxKeys: number = DEFAULT_MAX_KEYS,
  ) {}

  /** Counts one request of `key` against `rule`, or refuses it. */
  take(key: string, rule: RateLimit): RateDecision {
    const now = this.clock.now().getTime();
    const current = this.windows.get(key);
    if (current !== undefined && current.endsAt > now) {
      if (current.count >= rule.limit) {
        return { allowed: false, retryAfterSeconds: Math.ceil((current.endsAt - now) / 1000) };
      }
      current.count += 1;
      return { allowed: true };
    }
    if (current !== undefined) this.windows.delete(key);
    this.makeRoom(now);
    this.windows.set(key, { endsAt: now + rule.windowMillis, count: 1 });
    return { allowed: true };
  }

  /** How many keys are remembered; for tests of the memory bound. */
  get size(): number {
    return this.windows.size;
  }

  // Ended windows go first; if a flood of distinct keys still fills the map, the oldest
  // windows are dropped, which can only ever let a request in, never keep one out.
  private makeRoom(now: number): void {
    if (this.windows.size < this.maxKeys) return;
    for (const [key, window] of this.windows) {
      if (window.endsAt <= now) this.windows.delete(key);
    }
    for (const key of this.windows.keys()) {
      if (this.windows.size < this.maxKeys) break;
      this.windows.delete(key);
    }
  }
}
