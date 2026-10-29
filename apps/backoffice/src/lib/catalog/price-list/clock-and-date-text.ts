import { formatBusinessDate } from "@fnb/domain";

const CLOCK = /^(\d{1,2}):(\d{2})$/;
const DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** Every branch is in Vietnam: a day starts at 00:00 UTC+7, whatever the browser's zone. */
const SHOP_OFFSET_MS = 7 * 60 * MINUTE_MS;

/** "14:30" typed in a box as minutes of the day; "24:00" (midnight) only when `endOfDay`. */
export function parseClockText(text: string, endOfDay: boolean): number | null {
  const parts = CLOCK.exec(text.trim());
  if (parts === null) return null;
  const [hours, minutes] = [Number(parts[1]), Number(parts[2])];
  if (minutes > 59) return null;
  if (hours === 24 && minutes === 0) return endOfDay ? 1440 : null;
  return hours > 23 ? null : hours * 60 + minutes;
}

/** Minutes of the day as the shop writes a time: "14:00", midnight at the end as "24:00". */
export function clockText(minute: number): string {
  const [hours, minutes] = [Math.floor(minute / 60), minute % 60];
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** The shop-local calendar day of an instant, "dd/mm/yyyy". */
export function localDateText(instantMillis: number): string {
  return formatBusinessDate(new Date(instantMillis + SHOP_OFFSET_MS).toISOString().slice(0, 10));
}

/** The instant a typed "dd/mm/yyyy" day starts at (00:00 shop time), or null if no such day. */
export function startOfDayText(text: string): number | null {
  const parts = DATE.exec(text.trim());
  if (parts === null) return null;
  const [day, month, year] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const at = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== iso) return null;
  return at.getTime() - SHOP_OFFSET_MS;
}

/** The first instant after a typed last day: a rule "until 07/11" holds through that whole day. */
export const endOfDayText = (text: string): number | null => {
  const start = startOfDayText(text);
  return start === null ? null : start + DAY_MS;
};

/** The last day a rule holds, as typed: the day before its (exclusive) end. */
export const lastDayText = (validToMillis: number): string => localDateText(validToMillis - 1);
