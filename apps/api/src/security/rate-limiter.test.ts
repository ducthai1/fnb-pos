import { describe, expect, it } from "vitest";
import type { Clock } from "../clock";
import { FixedWindowRateLimiter } from "./rate-limiter";

class HandClock implements Clock {
  private current = Date.parse("2026-10-21T02:00:00.000Z");
  now(): Date {
    return new Date(this.current);
  }
  advance(millis: number): void {
    this.current += millis;
  }
}

const RULE = { limit: 3, windowMillis: 60_000 };

describe("fixed-window rate limiter", () => {
  it("lets a key in up to its limit within one window", () => {
    const limiter = new FixedWindowRateLimiter(new HandClock());
    const decisions = [1, 2, 3].map(() => limiter.take("a", RULE));
    expect(decisions).toEqual([{ allowed: true }, { allowed: true }, { allowed: true }]);
  });

  it("refuses the request past the limit and says when to come back", () => {
    const clock = new HandClock();
    const limiter = new FixedWindowRateLimiter(clock);
    for (let i = 0; i < 3; i++) limiter.take("a", RULE);
    clock.advance(20_500);
    expect(limiter.take("a", RULE)).toEqual({ allowed: false, retryAfterSeconds: 40 });
  });

  it("opens again once the window has ended, not a moment before", () => {
    const clock = new HandClock();
    const limiter = new FixedWindowRateLimiter(clock);
    for (let i = 0; i < 3; i++) limiter.take("a", RULE);
    clock.advance(59_999);
    expect(limiter.take("a", RULE)).toEqual({ allowed: false, retryAfterSeconds: 1 });
    clock.advance(1);
    expect(limiter.take("a", RULE)).toEqual({ allowed: true });
  });

  it("does not count refused requests, so knocking does not extend the wait", () => {
    const clock = new HandClock();
    const limiter = new FixedWindowRateLimiter(clock);
    for (let i = 0; i < 3; i++) limiter.take("a", RULE);
    for (let i = 0; i < 50; i++) limiter.take("a", RULE);
    clock.advance(60_000);
    const next = [1, 2, 3, 4].map(() => limiter.take("a", RULE).allowed);
    expect(next).toEqual([true, true, true, false]);
  });

  it("counts each key on its own", () => {
    const limiter = new FixedWindowRateLimiter(new HandClock());
    for (let i = 0; i < 3; i++) limiter.take("a", RULE);
    expect(limiter.take("a", RULE).allowed).toBe(false);
    expect(limiter.take("b", RULE).allowed).toBe(true);
  });

  it("keeps its memory bounded, forgetting ended windows first", () => {
    const clock = new HandClock();
    const limiter = new FixedWindowRateLimiter(clock, 3);
    limiter.take("old", { limit: 1, windowMillis: 1_000 });
    limiter.take("busy", RULE);
    limiter.take("busy", RULE);
    limiter.take("busy", RULE);
    limiter.take("other", RULE);
    clock.advance(1_000);
    limiter.take("new", RULE);
    expect(limiter.size).toBe(3);
    expect(limiter.take("busy", RULE).allowed).toBe(false);
  });

  it("drops the oldest window when a flood of new keys fills the memory", () => {
    const limiter = new FixedWindowRateLimiter(new HandClock(), 2);
    for (let i = 0; i < 3; i++) limiter.take("first", RULE);
    limiter.take("second", RULE);
    limiter.take("third", RULE);
    expect(limiter.size).toBe(2);
    expect(limiter.take("first", RULE).allowed).toBe(true);
  });
});
