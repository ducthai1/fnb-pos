import { describe, expect, it } from "vitest";
import { isDomainError } from "../errors";
import { localClockParts, toIsoDate } from "./local-clock";
import { TIME_ERROR_CODES } from "./time-error-codes";

const VIETNAM = 7 * 60;

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return isDomainError(error) ? error.code : "not-a-domain-error";
  }
  return undefined;
}

describe("localClockParts", () => {
  it("moves an instant just after 17:00 UTC into the next local day in Vietnam", () => {
    const parts = localClockParts(Date.UTC(2026, 9, 19, 17, 0), VIETNAM);
    expect(parts).toEqual({ year: 2026, month: 10, day: 20, dayOfWeek: 2, minuteOfDay: 0 });
  });

  it("keeps an instant just before 17:00 UTC on the same local day", () => {
    const parts = localClockParts(Date.UTC(2026, 9, 19, 16, 59), VIETNAM);
    expect(parts).toEqual({ year: 2026, month: 10, day: 19, dayOfWeek: 1, minuteOfDay: 1439 });
  });

  it("handles negative offsets and year boundaries", () => {
    const parts = localClockParts(Date.UTC(2027, 0, 1, 2, 30), -5 * 60);
    expect(toIsoDate(parts)).toBe("2026-12-31");
    expect(parts.minuteOfDay).toBe(21 * 60 + 30);
  });

  it("formats ISO dates with zero padding", () => {
    expect(toIsoDate({ year: 2026, month: 3, day: 7 })).toBe("2026-03-07");
  });

  it.each([1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2])("rejects instant %d", (instant) => {
    expect(codeOf(() => localClockParts(instant, VIETNAM))).toBe(TIME_ERROR_CODES.invalidInstant);
  });

  it.each([-721, 841, 30.5])("rejects UTC offset %d", (offset) => {
    expect(codeOf(() => localClockParts(0, offset))).toBe(TIME_ERROR_CODES.invalidUtcOffset);
  });
});
