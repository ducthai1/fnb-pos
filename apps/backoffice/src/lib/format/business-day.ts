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

/**
 * The instants from the start of `fromDate` to the end of `toDate` (both whole days, the
 * end one included) on the shop's clock, as the print failure report takes them; null when
 * either is not a day or the range runs backwards.
 */
export function shopDaysWindow(fromDate: string, toDate: string): { from: string; to: string } | null {
  if (!isCalendarDate(fromDate) || !isCalendarDate(toDate) || fromDate > toDate) return null;
  const dayAfter = new Date(Date.parse(`${toDate}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
  return { from: `${fromDate}T00:00:00+07:00`, to: `${dayAfter}T00:00:00+07:00` };
}

/** "20/10/2026" for "2026-10-20"; the text itself when it is not a day. */
export function formatBusinessDate(text: string): string {
  if (!isCalendarDate(text)) return text;
  const [year, month, day] = text.split("-");
  return `${day}/${month}/${year}`;
}

/** An amount of whole đồng from an answer, written the domain's way ("35.000 ₫"). */
export const vndText = (amount: number): string => formatVnd(vnd(BigInt(amount)));

/** A decimal quantity from an answer ("1.5") as Vietnamese write it ("1,5"). */
export const quantityText = (quantity: string): string => quantity.replace(".", ",");
