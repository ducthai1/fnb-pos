import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEVICE_CLOCK_LIMITS, readCommandTime } from "./command-time";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const VIETNAM = { utcOffsetMinutes: 420, businessDayStartMinute: 240 };
/** 21:00 in Vietnam on 20 October. */
const RECEIVED = new Date("2026-10-20T14:00:00.000Z");

const sentAt = (offsetMs: number, received = RECEIVED) =>
  new Date(received.getTime() + offsetMs).toISOString();
const timeOf = (offsetMs: number, received = RECEIVED) => {
  const reading = readCommandTime(sentAt(offsetMs, received), received, VIETNAM);
  if (!reading.ok) throw new Error(`refused a command ${offsetMs} ms off`);
  return reading.time;
};

describe("a command's time", () => {
  it("refuses a till three minutes ahead of the server", () => {
    expect(readCommandTime(sentAt(3 * MINUTE), RECEIVED, VIETNAM)).toEqual({
      ok: false,
      code: "SYNC_DEVICE_CLOCK_AHEAD",
      aheadMs: 3 * MINUTE,
    });
  });

  it("takes a till one minute ahead, acting on when the server received it", () => {
    expect(timeOf(MINUTE)).toMatchObject({
      deviceAt: new Date(sentAt(MINUTE)),
      effectiveAt: RECEIVED,
      clampedByMs: MINUTE,
    });
  });

  it("takes a till exactly two minutes ahead, the last one it takes", () => {
    expect(timeOf(2 * MINUTE).effectiveAt).toEqual(RECEIVED);
    expect(readCommandTime(sentAt(2 * MINUTE + 1), RECEIVED, VIETNAM).ok).toBe(false);
  });

  it("believes an order recorded offline an hour before it arrived", () => {
    expect(timeOf(-HOUR)).toMatchObject({ effectiveAt: new Date(sentAt(-HOUR)), clampedByMs: 0 });
  });

  it("holds a till 13 hours behind at 12 hours before the server received it", () => {
    expect(timeOf(-13 * HOUR)).toMatchObject({
      deviceAt: new Date(sentAt(-13 * HOUR)),
      effectiveAt: new Date(sentAt(-12 * HOUR)),
      clampedByMs: -HOUR,
    });
  });

  it("dates a sale made at 03:30 and synced at 04:30 to the night it belongs to", () => {
    const received = new Date("2026-10-20T21:30:00.000Z"); // 04:30 on the 21st in Vietnam
    expect(timeOf(-HOUR, received).businessDate).toBe("2026-10-20");
    expect(timeOf(0, received).businessDate).toBe("2026-10-21");
  });

  it("dates a held-back command by the moment it was held at, not by the till's clock", () => {
    // The till claims 10:00 two days earlier; it is held at 09:00 on the 20th.
    const time = timeOf(-(2 * 24 + 11) * HOUR);
    expect(time.effectiveAt).toEqual(new Date("2026-10-20T02:00:00.000Z"));
    expect(time.businessDate).toBe("2026-10-20");
  });

  it("always acts within the limits, and on the till's time whenever that is within them", () => {
    fc.assert(
      fc.property(fc.integer({ min: -72 * HOUR, max: DEVICE_CLOCK_LIMITS.aheadMs }), (offset) => {
        const time = timeOf(offset);
        const effective = time.effectiveAt.getTime() - RECEIVED.getTime();
        expect(effective).toBeLessThanOrEqual(0);
        expect(effective).toBeGreaterThanOrEqual(-DEVICE_CLOCK_LIMITS.behindMs);
        if (offset <= 0 && offset >= -DEVICE_CLOCK_LIMITS.behindMs) expect(effective).toBe(offset);
        expect(time.clampedByMs).toBe(offset - effective);
      }),
    );
  });
});
