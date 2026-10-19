import type { LockoutPolicy } from "../auth/auth-policy";

export interface LockoutState {
  failedAttempts: number;
  lockedUntil: Date | null;
}

export type AttemptClaim =
  { allowed: false; lockedUntil: Date } | { allowed: true; next: LockoutState };

/**
 * Counts an attempt BEFORE the secret is checked, so parallel guesses cannot all pass
 * the gate while earlier ones are still being verified. The attempt that reaches the
 * limit is still checked (it may be right); the next is refused until the lock expires,
 * and an expired lock starts a fresh run. A success then resets with SUCCEEDED. The
 * backoffice login applies the same rule inside fnb_auth.claim_login_attempt.
 */
export function claimAttempt(state: LockoutState, now: Date, policy: LockoutPolicy): AttemptClaim {
  if (state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime()) {
    return { allowed: false, lockedUntil: state.lockedUntil };
  }
  const failedAttempts = state.lockedUntil === null ? state.failedAttempts + 1 : 1;
  const lockedUntil =
    failedAttempts >= policy.maxAttempts ? new Date(now.getTime() + policy.lockMillis) : null;
  return { allowed: true, next: { failedAttempts, lockedUntil } };
}

export const SUCCEEDED: LockoutState = { failedAttempts: 0, lockedUntil: null };
