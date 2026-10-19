import type { EscalatingLockoutPolicy } from "../auth/auth-policy";

export interface LockoutState {
  /** Attempts claimed since the last right secret, across locks. */
  failedAttempts: number;
  /** Set by the attempt that reached a lock; cleared by the next claim after it expires. */
  lockedUntil: Date | null;
}

export type AttemptClaim =
  { allowed: false; lockedUntil: Date } | { allowed: true; next: LockoutState };

/**
 * How long the `run`-th lock in a row lasts: the first lock, doubled for each lock before
 * it, never longer than the cap. The exponent is bounded so a long run cannot overflow.
 */
export function lockMillisForRun(run: number, policy: EscalatingLockoutPolicy): number {
  const doubled = policy.lockMillis * 2 ** Math.min(Math.max(run - 1, 0), 32);
  return Math.min(doubled, policy.maxLockMillis);
}

/**
 * Counts an attempt BEFORE the secret is checked, so parallel guesses cannot all pass
 * the gate while earlier ones are still being verified. Every `maxAttempts`-th attempt
 * since the last right secret locks, and it is still checked (it may be right); the next
 * is refused until the lock expires. The count does not restart when a lock expires, so
 * each lock in a row is longer than the one before; only a right secret starts it again.
 */
export function claimAttempt(
  state: LockoutState,
  now: Date,
  policy: EscalatingLockoutPolicy,
): AttemptClaim {
  if (state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime()) {
    return { allowed: false, lockedUntil: state.lockedUntil };
  }
  const failedAttempts = state.failedAttempts + 1;
  const run = failedAttempts / policy.maxAttempts;
  const lockedUntil = Number.isInteger(run)
    ? new Date(now.getTime() + lockMillisForRun(run, policy))
    : null;
  return { allowed: true, next: { failedAttempts, lockedUntil } };
}

export const SUCCEEDED: LockoutState = { failedAttempts: 0, lockedUntil: null };
