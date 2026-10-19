import type { Clock } from "../../../src/clock";

/** A clock tests move by hand, so lock windows and expiry are exercised without sleeping. */
export class ManualClock implements Clock {
  private current: number;

  constructor(start: Date = new Date("2026-10-20T08:00:00.000Z")) {
    this.current = start.getTime();
  }

  now(): Date {
    return new Date(this.current);
  }

  advance(millis: number): void {
    this.current += millis;
  }
}
