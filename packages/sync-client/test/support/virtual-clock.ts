import type { SyncClock } from "../../src";

/** Time that moves only when a till waits out a backoff, so no scenario ever really sleeps. */
export function virtualClock(start = Date.parse("2026-10-20T03:00:00.000Z")) {
  let now = start;
  let waited = 0;
  const clock: SyncClock = {
    now: () => now,
    sleep: async (ms) => {
      now += ms;
      waited += ms;
    },
  };
  return { clock, waitedMs: () => waited };
}
