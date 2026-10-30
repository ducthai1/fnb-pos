import type { SyncClock } from "../../src";

/**
 * The one clock of a simulated shop: the server and every till read it, each till through
 * its own skew. A till waiting out a backoff lets the world's time pass, as it does in a
 * real shop where the server's clock keeps running while a till sleeps.
 */
export class WorldClock {
  constructor(private ms: number) {}

  now(): number {
    return this.ms;
  }

  /** Time only moves forward: a tick that was already passed by a backoff is not rewound. */
  advanceTo(ms: number): void {
    if (ms > this.ms) this.ms = ms;
  }

  /** The API's clock. */
  server(): { now(): Date } {
    return { now: () => new Date(this.ms) };
  }

  /** A till's clock, `skewMs()` ahead of the world's (behind when negative). */
  till(skewMs: () => number): SyncClock {
    return {
      now: () => this.ms + skewMs(),
      sleep: async (ms) => {
        this.ms += ms;
      },
    };
  }
}

/** Minutes since midnight in Vietnam (UTC+7) at `ms`, for a workload that follows the shop's day. */
export const vietnamMinuteOfDay = (ms: number): number => {
  const date = new Date(ms + 7 * 60 * 60_000);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
};

/** The Vietnamese calendar date (YYYY-MM-DD) of `ms`. */
export const vietnamDate = (ms: number): string =>
  new Date(ms + 7 * 60 * 60_000).toISOString().slice(0, 10);
