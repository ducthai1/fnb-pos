import { historyTimeOf, type HistoryEntry } from "../../features/history/order-history";
import { vi } from "../../messages/vi";

const H = vi.history;

/** The colour beside each status word: paid is done, a draft still waits, the rest undone. */
export const STATUS_TONE: Readonly<Record<HistoryEntry["status"], string>> = {
  draft: "info",
  paid: "ok",
  cancelled: "danger",
  refunded: "warn",
};

/** Where the order was served: its table (or the tag the cashier gave it), or take-away. */
export function whereOf(entry: HistoryEntry): string {
  const { order } = entry;
  if (order.tableName !== null) return H.where.table(order.tableName);
  if (order.tableTag !== null) return H.where.table(order.tableTag);
  return H.where.takeaway;
}

// The shop's clock is Vietnam's whatever the machine is set to, as on the printed bill.
const CLOCK = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Ho_Chi_Minh",
});

/** "10:15": when it was paid, or for a draft when it was opened; empty when unknown. */
export function clockOf(iso: string | null): string {
  if (iso === null) return "";
  const at = Date.parse(iso);
  return Number.isNaN(at) ? "" : CLOCK.format(at);
}

export const historyClockOf = (entry: HistoryEntry) => clockOf(historyTimeOf(entry.order));
