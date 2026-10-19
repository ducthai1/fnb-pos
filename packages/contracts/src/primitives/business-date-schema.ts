import { z } from "zod";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

/** Whether "YYYY-MM-DD" names a day that exists; 2026-02-29 does not. */
function isCalendarDate(text: string): boolean {
  const match = ISO_DATE.exec(text);
  if (match === null) return false;
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  const monthLength = DAYS_IN_MONTH[month - 1];
  if (year < 1 || monthLength === undefined) return false;
  const lastDay = month === 2 && isLeapYear(year) ? 29 : monthLength;
  return day >= 1 && day <= lastDay;
}

/**
 * The day a sale is booked to, as the domain computes it: "YYYY-MM-DD", no time, no zone.
 * Checked by arithmetic rather than Date parsing, which rolls 2026-02-30 over to March.
 */
export const businessDateSchema = z
  .string()
  .refine(isCalendarDate, { message: "not a calendar date in YYYY-MM-DD form" });
