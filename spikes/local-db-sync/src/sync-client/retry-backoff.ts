import type { SeededRandom } from "../shared/seeded-random";

export interface BackoffPolicy {
  baseMs: number;
  maxMs: number;
}

/**
 * Exponential backoff with "equal jitter": half fixed, half random. Without jitter every
 * till in a shop retries in lockstep the moment the router comes back.
 */
export function backoffDelayMs(policy: BackoffPolicy, attempt: number, random: SeededRandom): number {
  const ceiling = Math.min(policy.maxMs, policy.baseMs * 2 ** Math.min(attempt, 20));
  return Math.round(ceiling / 2 + (random.next() * ceiling) / 2);
}
