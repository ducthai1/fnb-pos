import { describe, expect, it } from "vitest";
import { type LockoutState, SUCCEEDED, claimAttempt, lockMillisForRun } from "./attempt-lockout";

const MINUTE = 60_000;
const POLICY = { maxAttempts: 5, lockMillis: 5 * MINUTE, maxLockMillis: 24 * 60 * MINUTE };
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

/** The length of each lock when every lock is waited out and then failed again. */
function lockLengths(runs: number, from: LockoutState = SUCCEEDED, start = T0): number[] {
  const lengths: number[] = [];
  let state = from;
  let now = start;
  for (let run = 0; run < runs; run++) {
    state = failures(state, POLICY.maxAttempts, now);
    if (state.lockedUntil === null) throw new Error(`run ${run + 1} did not lock`);
    lengths.push(state.lockedUntil.getTime() - now.getTime());
    now = state.lockedUntil;
  }
  return lengths;
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

  it("keeps counting once the lock has expired instead of starting a fresh run", () => {
    const locked = failures(SUCCEEDED, 5, T0);
    const claim = claimAttempt(locked, at(POLICY.lockMillis), POLICY);
    expect(claim).toEqual({ allowed: true, next: { failedAttempts: 6, lockedUntil: null } });
  });

  it("doubles each lock that follows another without a right secret in between", () => {
    expect(lockLengths(4).map((millis) => millis / MINUTE)).toEqual([5, 10, 20, 40]);
  });

  it("never locks for longer than a day, however long the run", () => {
    const minutes = lockLengths(14).map((millis) => millis / MINUTE);
    expect(minutes).toEqual([5, 10, 20, 40, 80, 160, 320, 640, 1280, 1440, 1440, 1440, 1440, 1440]);
    expect(lockMillisForRun(10_000, POLICY)).toBe(POLICY.maxLockMillis);
  });

  it("starts again at the first lock only from the state a right secret leaves", () => {
    const afterThreeLocks = failures(
      failures(failures(SUCCEEDED, 5, T0), 5, at(5 * MINUTE)),
      5,
      at(15 * MINUTE),
    );
    expect(afterThreeLocks.lockedUntil).toEqual(at(35 * MINUTE));
    const resume = at(35 * MINUTE);
    expect(lockLengths(1, afterThreeLocks, resume)).toEqual([40 * MINUTE]);
    expect(lockLengths(1, SUCCEEDED, resume)).toEqual([5 * MINUTE]);
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

  it("lets a guess a second through only a limit's worth per lock over three days", () => {
    let state: LockoutState = SUCCEEDED;
    let allowed = 0;
    for (let second = 0; second < 3 * 24 * 3600; second++) {
      const claim = claimAttempt(state, at(second * 1000), POLICY);
      if (!claim.allowed) continue;
      allowed++;
      state = claim.next;
    }
    // Locks of 5, 10 … 1280 minutes, then a day: the eleventh run is the last to fit.
    // A fixed 5-minute lock would have let about 4,300 guesses through in the same time.
    expect(allowed).toBe(11 * POLICY.maxAttempts);
  });
});
