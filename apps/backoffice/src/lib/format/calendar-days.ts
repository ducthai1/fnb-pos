import { formatBusinessDate } from "@fnb/domain";
import { isCalendarDate } from "./business-day";

const DAY_MS = 24 * 60 * 60_000;
const atNoon = (day: string) => Date.parse(`${day}T12:00:00Z`);
const iso = (millis: number) => new Date(millis).toISOString().slice(0, 10);

/**
 * A day as a person types it, day first ("30/10/2026", "3-1-2026", "03.01.2026"), as the
 * "YYYY-MM-DD" the pages keep; null when it is not a real day. Month first is never guessed:
 * "10/30/2026" is not a day.
 */
export function parseDayMonthYear(text: string): string | null {
  const match = /^\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})\s*$/.exec(text);
  if (match === null) return null;
  const [, day = "", month = "", year = ""] = match;
  const found = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return isCalendarDate(found) ? found : null;
}

/** "30/10/2026" for "2026-10-30", whatever the browser's language; "" when it is not a day. */
export const dayMonthYear = (day: string): string =>
  isCalendarDate(day) ? formatBusinessDate(day) : "";

/** The day `count` days after (before, when negative) a day. */
export const shiftDays = (day: string, count: number): string => iso(atNoon(day) + count * DAY_MS);

/** The same day number `count` months on, or the month's last day when it has no such number. */
export function shiftMonths(day: string, count: number): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + count, 1, 12));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12));
  return iso(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(date, last.getUTCDate()), 12),
  );
}

/** 0 for Monday … 6 for Sunday: the week a Vietnamese calendar reads. */
export const mondayFirstWeekday = (day: string): number =>
  (new Date(atNoon(day)).getUTCDay() + 6) % 7;

/** The weeks that show a month, Monday first, each of 7 days (the days around it included). */
export function monthWeeks(day: string): string[][] {
  const first = `${day.slice(0, 7)}-01`;
  const start = shiftDays(first, -mondayFirstWeekday(first));
  const weeks: string[][] = [];
  for (let week = 0; week < 6; week += 1) {
    const days = Array.from({ length: 7 }, (_, at) => shiftDays(start, week * 7 + at));
    // A week that is all the next month is not worth the height.
    if (week >= 4 && days.every((one) => one.slice(0, 7) !== day.slice(0, 7))) break;
    weeks.push(days);
  }
  return weeks;
}

/** "Tháng 10 năm 2026" for a day of that month. */
export const monthTitle = (day: string): string =>
  `Tháng ${Number(day.slice(5, 7))} năm ${day.slice(0, 4)}`;
