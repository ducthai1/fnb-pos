import { DomainError } from "../errors";
import { localClockParts, toIsoDate } from "./local-clock";
import { TIME_ERROR_CODES } from "./time-error-codes";

export interface BusinessDateOptions {
  /** The branch's fixed UTC offset in minutes (Vietnam: 420). */
  utcOffsetMinutes: number;
  /**
   * Local minute of the day (0–1439) at which a new business day starts. There is no default
   * here on purpose: the branch setting owns it (usually 240 = 04:00), and a silent fallback
   * would book a late-night shop's sales on the wrong day without anyone noticing.
   */
  dayStartMinute: number;
}

const DAY_MS = 24 * 60 * 60_000;

/**
 * The "YYYY-MM-DD" day a sale belongs to. A bar open until 02:00 closes one shift for the
 * whole night, so anything before dayStartMinute local time still counts toward the
 * previous calendar day. Offsets are fixed (no daylight saving), so stepping back exactly
 * 24 hours always lands on the previous calendar date.
 */
export function businessDate(epochMillis: number, options: BusinessDateOptions): string {
  assertDayStartMinute(options.dayStartMinute);
  const local = localClockParts(epochMillis, options.utcOffsetMinutes);
  if (local.minuteOfDay >= options.dayStartMinute) return toIsoDate(local);
  return toIsoDate(localClockParts(epochMillis - DAY_MS, options.utcOffsetMinutes));
}

function assertDayStartMinute(dayStartMinute: number): void {
  if (!Number.isInteger(dayStartMinute) || dayStartMinute < 0 || dayStartMinute > 1439) {
    throw new DomainError(
      TIME_ERROR_CODES.invalidDayStartMinute,
      `business day start must be a whole minute between 0 and 1439: ${dayStartMinute}`,
    );
  }
}
