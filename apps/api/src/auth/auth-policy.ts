export interface LockoutPolicy {
  /** Consecutive failures that lock; the attempt reaching it is still checked. */
  maxAttempts: number;
  lockMillis: number;
}

/** A lockout whose locks grow while no right secret is entered in between. */
export interface EscalatingLockoutPolicy extends LockoutPolicy {
  /** `lockMillis` is the first lock; each further one lasts twice as long, up to this. */
  maxLockMillis: number;
}

export interface AuthPolicy {
  login: LockoutPolicy;
  sessionTtlMillis: number;
  /** How long a pairing code shown in the backoffice can be typed into a till. */
  pairingCodeTtlMillis: number;
  pin: EscalatingLockoutPolicy;
  /** A staff session lasts one shift on one till. */
  staffSessionTtlMillis: number;
}

const MINUTE = 60_000;

/**
 * A fixed 15-minute login lock rather than one that grows: anyone who knows an owner's
 * email can trigger the lock, and a growing lock would let them keep the owner out for
 * hours. Fifteen minutes still caps online guessing at 5 passwords per quarter hour per
 * account. Sessions end 7 days after sign-in, never extended, so a lost laptop stops
 * working on its own within a week.
 *
 * A PIN has only 10,000 values, so a fixed 5-minute lock would let one paired till try
 * them all within a week, and a manager's PIN is the signature on refunds and discounts.
 * Its lock therefore doubles with every lock in a row (5 minutes, 10, 20 … a day at most).
 * Locking a colleague out takes standing at a paired till of their branch, and every lock
 * is written to the audit trail with that till as the actor.
 */
export const DEFAULT_AUTH_POLICY: AuthPolicy = {
  login: { maxAttempts: 5, lockMillis: 15 * MINUTE },
  sessionTtlMillis: 7 * 24 * 60 * MINUTE,
  pairingCodeTtlMillis: 10 * MINUTE,
  pin: { maxAttempts: 5, lockMillis: 5 * MINUTE, maxLockMillis: 24 * 60 * MINUTE },
  staffSessionTtlMillis: 12 * 60 * MINUTE,
};
