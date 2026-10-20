import { vi } from "../../messages/vi";

const F = vi.tables.floor;
const MINUTE_MS = 60_000;

/**
 * How long the guests have sat, from when their order was opened. Null (an order the server
 * has not answered for yet) reads as just opened; a clock behind the server's never shows a
 * negative time.
 */
export function seatedFor(openedAt: string | null, now: number): string {
  const minutes = seatedMinutes(openedAt, now);
  if (minutes === null) return F.justOpened;
  if (minutes < 60) return F.seatedFor(F.minutes(minutes));
  return F.seatedFor(F.hours(Math.floor(minutes / 60), minutes % 60));
}

/** Whole minutes the guests have sat; null for an order the server has not answered for. */
export function seatedMinutes(openedAt: string | null, now: number): number | null {
  const opened = openedAt === null ? Number.NaN : Date.parse(openedAt);
  if (Number.isNaN(opened)) return null;
  return Math.max(0, Math.floor((now - opened) / MINUTE_MS));
}

/** Past this, a table's time sat is marked so a waiter checks on it. */
export const LONG_SEATED_MINUTES = 120;
