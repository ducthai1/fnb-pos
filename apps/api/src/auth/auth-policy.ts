export interface LockoutPolicy {
  /** Consecutive failures that lock; the attempt reaching it is still checked. */
  maxAttempts: number;
  lockMillis: number;
}

export interface AuthPolicy {
  login: LockoutPolicy;
  sessionTtlMillis: number;
}

const MINUTE = 60_000;

/**
 * A fixed 15-minute lock rather than one that grows: anyone who knows an owner's email
 * can trigger the lock, and a growing lock would let them keep the owner out for hours.
 * Fifteen minutes still caps online guessing at 5 passwords per quarter hour per account.
 * Sessions end 7 days after sign-in, never extended, so a lost laptop stops working on
 * its own within a week.
 */
export const DEFAULT_AUTH_POLICY: AuthPolicy = {
  login: { maxAttempts: 5, lockMillis: 15 * MINUTE },
  sessionTtlMillis: 7 * 24 * 60 * MINUTE,
};
