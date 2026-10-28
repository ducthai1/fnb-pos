import { businessDate, formatVnd, vnd } from "@fnb/domain";

/**
 * The clock a branch gets unless it is set otherwise: Vietnam (UTC+7), the business day
 * starting at 04:00. The branch list does not carry a branch's own clock yet, so pages
 * suggest today's business day by it; the person can always pick another day.
 */
const DEFAULT_BRANCH_CLOCK = { utcOffsetMinutes: 420, dayStartMinute: 240 } as const;

/** Today's business day ("YYYY-MM-DD") on the default branch clock, by the domain's rule. */
export function todaysBusinessDate(nowMillis: number = Date.now()): string {
  return businessDate(nowMillis, DEFAULT_BRANCH_CLOCK);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Whether the text is a real calendar day as a date input gives it. */
export function isCalendarDate(text: string): boolean {
  if (!ISO_DATE.test(text)) return false;
  const at = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === text;
}

const DAY_MS = 24 * 60 * 60_000;

/** The instant a business day opens on the default branch clock (04:00 that date, UTC+7). */
const businessDayOpens = (date: string): number =>
  Date.parse(`${date}T00:00:00Z`) +
  (DEFAULT_BRANCH_CLOCK.dayStartMinute - DEFAULT_BRANCH_CLOCK.utcOffsetMinutes) * 60_000;

/**
 * The instants from the opening of business day `fromDate` to the closing of business day
 * `toDate` (the end one included), as the print failure report takes them; null when either
 * is not a day or the range runs backwards. Business days, not calendar days: a slip that
 * jammed at 01:00 belongs to the day the pickers call "today" until 04:00.
 */
export function shopDaysWindow(
  fromDate: string,
  toDate: string,
): { from: string; to: string } | null {
  if (!isCalendarDate(fromDate) || !isCalendarDate(toDate) || fromDate > toDate) return null;
  return {
    from: new Date(businessDayOpens(fromDate)).toISOString(),
    to: new Date(businessDayOpens(toDate) + DAY_MS).toISOString(),
  };
}

/** The calendar day before a day ("2026-10-19" for "2026-10-20"); the text itself when it is not a day. */
export function dayBefore(text: string): string {
  if (!isCalendarDate(text)) return text;
  return new Date(Date.parse(`${text}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
}

/** The calendar day after a day; the text itself when it is not a day. */
export function dayAfter(text: string): string {
  if (!isCalendarDate(text)) return text;
  return new Date(Date.parse(`${text}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
}

/** The first day of the `days` days that end on `last` (that day itself for 1). */
export function firstOfLastDays(last: string, days: number): string {
  let first = last;
  for (let step = 1; step < days; step += 1) first = dayBefore(first);
  return first;
}

/** "20/10/2026" for "2026-10-20"; the text itself when it is not a day (as on the till). */
export { formatBusinessDate } from "@fnb/domain";

/** An amount of whole đồng from an answer, written the domain's way ("35.000 ₫"). */
export const vndText = (amount: number): string => formatVnd(vnd(BigInt(amount)));

/** A decimal quantity from an answer ("1.5") as Vietnamese write it ("1,5"). */
export const quantityText = (quantity: string): string => quantity.replace(".", ",");
