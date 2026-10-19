import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isDomainError } from "../errors";
import { businessDate } from "./business-date";
import { localClockParts, toIsoDate } from "./local-clock";
import { TIME_ERROR_CODES } from "./time-error-codes";

const VIETNAM = 7 * 60;
const FOUR_AM = 4 * 60;
const MINUTE_MS = 60_000;

/** The instant at which a Vietnamese wall clock shows this date and time. */
function vietnamTime(year: number, month: number, day: number, hour: number, minute: number) {
  return Date.UTC(year, month - 1, day, hour, minute) - VIETNAM * MINUTE_MS;
}

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return isDomainError(error) ? error.code : "not-a-domain-error";
  }
  return undefined;
}

const fourAmInVietnam = { utcOffsetMinutes: VIETNAM, dayStartMinute: FOUR_AM };

describe("businessDate", () => {
  it("books a sale at 03:59 on the previous day when the day starts at 04:00", () => {
    expect(businessDate(vietnamTime(2026, 10, 20, 3, 59), fourAmInVietnam)).toBe("2026-10-19");
  });

  it("starts the new business day exactly at 04:00", () => {
    expect(businessDate(vietnamTime(2026, 10, 20, 4, 0), fourAmInVietnam)).toBe("2026-10-20");
  });

  it("with the day starting at midnight, is the plain calendar date", () => {
    const midnight = { utcOffsetMinutes: VIETNAM, dayStartMinute: 0 };
    expect(businessDate(vietnamTime(2026, 10, 20, 0, 0), midnight)).toBe("2026-10-20");
    expect(businessDate(vietnamTime(2026, 10, 20, 23, 59), midnight)).toBe("2026-10-20");
  });

  it("rolls back across month, leap-day and year boundaries", () => {
    expect(businessDate(vietnamTime(2027, 1, 1, 3, 0), fourAmInVietnam)).toBe("2026-12-31");
    expect(businessDate(vietnamTime(2026, 3, 1, 2, 0), fourAmInVietnam)).toBe("2026-02-28");
    expect(businessDate(vietnamTime(2028, 3, 1, 2, 0), fourAmInVietnam)).toBe("2028-02-29");
  });

  it("reads the branch's UTC+7 wall clock, not UTC", () => {
    // 21:30 UTC on the 19th is 04:30 on the 20th in Vietnam.
    const instant = Date.UTC(2026, 9, 19, 21, 30);
    expect(businessDate(instant, fourAmInVietnam)).toBe("2026-10-20");
    expect(businessDate(instant, { utcOffsetMinutes: 0, dayStartMinute: FOUR_AM })).toBe(
      "2026-10-19",
    );
  });

  it("accepts the latest possible day start, 23:59", () => {
    const lateStart = { utcOffsetMinutes: VIETNAM, dayStartMinute: 1439 };
    expect(businessDate(vietnamTime(2026, 10, 20, 23, 58), lateStart)).toBe("2026-10-19");
    expect(businessDate(vietnamTime(2026, 10, 20, 23, 59), lateStart)).toBe("2026-10-20");
  });

  it.each([-1, 1440, 30.5, Number.NaN])("refuses a day start of %d", (dayStartMinute) => {
    const options = { utcOffsetMinutes: VIETNAM, dayStartMinute };
    expect(codeOf(() => businessDate(0, options))).toBe(TIME_ERROR_CODES.invalidDayStartMinute);
  });

  it("still refuses an impossible UTC offset", () => {
    const options = { utcOffsetMinutes: 900, dayStartMinute: FOUR_AM };
    expect(codeOf(() => businessDate(0, options))).toBe(TIME_ERROR_CODES.invalidUtcOffset);
  });

  const instant = fc
    .date({
      min: new Date(Date.UTC(1990, 0, 1)),
      max: new Date(Date.UTC(2100, 0, 1)),
      noInvalidDate: true,
    })
    .map((date) => date.getTime());
  const branch = fc.record({
    utcOffsetMinutes: fc.integer({ min: -720, max: 840 }),
    dayStartMinute: fc.integer({ min: 0, max: 1439 }),
  });

  it("never goes backwards as time moves forward", () => {
    fc.assert(
      fc.property(instant, instant, branch, (a, b, options) => {
        const [earlier, later] = a <= b ? [a, b] : [b, a];
        expect(businessDate(earlier, options) <= businessDate(later, options)).toBe(true);
      }),
    );
  });

  it("equals the calendar date of the instant moved back by the day start", () => {
    fc.assert(
      fc.property(instant, branch, (t, options) => {
        const shifted = localClockParts(
          t - options.dayStartMinute * MINUTE_MS,
          options.utcOffsetMinutes,
        );
        expect(businessDate(t, options)).toBe(toIsoDate(shifted));
      }),
    );
  });
});
