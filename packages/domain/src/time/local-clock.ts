import { DomainError } from "../errors";
import { TIME_ERROR_CODES } from "./time-error-codes";

export interface LocalClockParts {
  year: number;
  /** 1–12 */
  month: number;
  /** 1–31 */
  day: number;
  /** 0 = Sunday … 6 = Saturday */
  dayOfWeek: number;
  /** 0–1439 */
  minuteOfDay: number;
}

const MINUTE_MS = 60_000;

/**
 * Wall-clock parts of an instant at a branch. Branches carry a fixed UTC offset
 * (Vietnam is UTC+7, no daylight saving) instead of a time-zone name, so every
 * device computes the same answer regardless of its platform's tz database.
 */
export function localClockParts(epochMillis: number, utcOffsetMinutes: number): LocalClockParts {
  assertInstant(epochMillis);
  assertOffset(utcOffsetMinutes);
  const shifted = new Date(epochMillis + utcOffsetMinutes * MINUTE_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    dayOfWeek: shifted.getUTCDay(),
    minuteOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/** "2026-10-20" */
export function toIsoDate(parts: Pick<LocalClockParts, "year" | "month" | "day">): string {
  const mm = String(parts.month).padStart(2, "0");
  const dd = String(parts.day).padStart(2, "0");
  return `${String(parts.year).padStart(4, "0")}-${mm}-${dd}`;
}

function assertInstant(epochMillis: number): void {
  if (!Number.isSafeInteger(epochMillis)) {
    throw new DomainError(
      TIME_ERROR_CODES.invalidInstant,
      `not an epoch-millis integer: ${epochMillis}`,
    );
  }
}

function assertOffset(utcOffsetMinutes: number): void {
  if (!Number.isInteger(utcOffsetMinutes) || utcOffsetMinutes < -720 || utcOffsetMinutes > 840) {
    throw new DomainError(
      TIME_ERROR_CODES.invalidUtcOffset,
      `UTC offset must be whole minutes between -720 and 840: ${utcOffsetMinutes}`,
    );
  }
}
