import type { Clock } from "../../../src/clock";
import type { CallDeadlines } from "../../../src/einvoice/einvoice-provider-call";

/**
 * A clock tests move by hand, so lock windows and expiry are exercised without sleeping.
 * It also hands out deadlines, fired as time is moved past them, so a call given up for
 * time is given up when the test says the time has come.
 */
export class ManualClock implements Clock, CallDeadlines {
  private current: number;
  private readonly deadlines: { at: number; controller: AbortController }[] = [];

  constructor(start: Date = new Date("2026-10-20T08:00:00.000Z")) {
    this.current = start.getTime();
  }

  now(): Date {
    return new Date(this.current);
  }

  advance(millis: number): void {
    this.current += millis;
    for (const deadline of this.deadlines.splice(0)) {
      if (deadline.at > this.current) this.deadlines.push(deadline);
      else deadline.controller.abort(new DOMException("deadline passed", "TimeoutError"));
    }
  }

  signalAfter(ms: number): AbortSignal {
    const controller = new AbortController();
    this.deadlines.push({ at: this.current + ms, controller });
    return controller.signal;
  }
}
