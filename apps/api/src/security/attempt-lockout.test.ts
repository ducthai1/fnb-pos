import { describe, expect, it } from "vitest";
import { type LockoutState, SUCCEEDED, claimAttempt } from "./attempt-lockout";

const POLICY = { maxAttempts: 5, lockMillis: 300_000 };
const T0 = new Date("2026-10-20T08:00:00.000Z");
const at = (millis: number) => new Date(T0.getTime() + millis);

/** Plays `count` claims at time `now`, as failures, from `state`. */
function failures(state: LockoutState, count: number, now: Date): LockoutState {
  let current = state;
  for (let i = 0; i < count; i++) {
    const claim = claimAttempt(current, now, POLICY);
    if (!claim.allowed) throw new Error(`claim ${i + 1} was refused`);
    current = claim.next;
  }
  return current;
}

describe("claimAttempt", () => {
  it("allows the attempts up to and including the limit, and locks on the last of them", () => {
    const four = failures(SUCCEEDED, 4, T0);
    expect(four).toEqual({ failedAttempts: 4, lockedUntil: null });
    expect(claimAttempt(four, T0, POLICY)).toEqual({
      allowed: true,
      next: { failedAttempts: 5, lockedUntil: at(POLICY.lockMillis) },
    });
  });

  it("refuses every attempt while locked, up to the last millisecond", () => {
    const locked = failures(SUCCEEDED, 5, T0);
    for (const offset of [0, 1, POLICY.lockMillis - 1]) {
      expect(claimAttempt(locked, at(offset), POLICY)).toEqual({
        allowed: false,
        lockedUntil: at(POLICY.lockMillis),
      });
    }
  });

  it("starts a fresh run once the lock has expired", () => {
    const locked = failures(SUCCEEDED, 5, T0);
    const claim = claimAttempt(locked, at(POLICY.lockMillis), POLICY);
    expect(claim).toEqual({ allowed: true, next: { failedAttempts: 1, lockedUntil: null } });
  });

  it("locks again only after a whole new run of failures", () => {
    const relocked = failures(failures(SUCCEEDED, 5, T0), 5, at(POLICY.lockMillis));
    expect(relocked.lockedUntil).toEqual(at(2 * POLICY.lockMillis));
  });

  it("never allows more than the limit within one lock window, however many tries", () => {
    let state: LockoutState = SUCCEEDED;
    let allowed = 0;
    for (let i = 0; i < 50; i++) {
      const claim = claimAttempt(state, at(i), POLICY);
      if (claim.allowed) {
        allowed++;
        state = claim.next;
      }
    }
    expect(allowed).toBe(POLICY.maxAttempts);
  });
});
