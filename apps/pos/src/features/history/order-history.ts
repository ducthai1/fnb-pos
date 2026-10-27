import {
  type Vnd,
  ZERO_VND,
  addVnd,
  computeOrderTotals,
  isDomainError,
  negateVnd,
} from "@fnb/domain";
import type { EntityView } from "@fnb/sync-client";
import { type StoredOrder, domainOrderOf, readStoredOrder } from "../order/stored-order";

export type HistoryStatus = "draft" | "paid" | "cancelled" | "refunded";
export type HistoryFilter = HistoryStatus | "all";

/** One order of the day as the history lists it, with what its refunds gave back. */
export interface HistoryEntry {
  readonly order: StoredOrder;
  readonly status: HistoryStatus;
  /** The domain's amount due on the order. */
  readonly amountDue: Vnd;
  /** What its refunds gave back, as a positive amount. */
  readonly refunded: Vnd;
  readonly refunds: readonly StoredOrder[];
  /** Opened on this till: its number is this till's. */
  readonly ownTill: boolean;
}

/** The domain's amount due; an order the domain cannot read counts as nothing. */
function dueOf(order: StoredOrder, profile = order.chargeProfile): Vnd {
  try {
    return computeOrderTotals(domainOrderOf(order), profile).amountDue;
  } catch (error) {
    if (isDomainError(error)) return ZERO_VND;
    throw error;
  }
}

/**
 * The orders of business day `day` the till holds (its own copies while they wait, the
 * server's after), newest first. A refund is listed under the sale it gives back part of,
 * and marks that sale refunded; a cancelled refund gave nothing back.
 */
export function orderHistory(
  views: readonly EntityView[],
  day: string,
  deviceId: string,
): HistoryEntry[] {
  const orders = views.flatMap((view) => {
    const order = readStoredOrder(view.snapshot);
    return order === null ? [] : [order];
  });
  const refundsOf = new Map<string, StoredOrder[]>();
  for (const order of orders) {
    if (order.refundOfOrderId === null || order.status === "cancelled") continue;
    refundsOf.set(order.refundOfOrderId, [...(refundsOf.get(order.refundOfOrderId) ?? []), order]);
  }
  return orders
    .filter((order) => order.refundOfOrderId === null && order.businessDate === day)
    .map((order) => {
      const refunds = refundsOf.get(order.orderId) ?? [];
      const given = refunds.map((refund) => negateVnd(dueOf(refund, order.chargeProfile)));
      const settled = order.status === "paid" || order.status === "posted";
      const status: HistoryStatus = !settled
        ? order.status === "cancelled"
          ? "cancelled"
          : "draft"
        : refunds.length > 0
          ? "refunded"
          : "paid";
      return {
        order,
        status,
        amountDue: dueOf(order),
        refunded: addVnd(ZERO_VND, ...given),
        refunds,
        ownTill: order.deviceId === deviceId,
      };
    })
    .sort(newestFirst);
}

/** When the history places an order: when it was paid, or for a draft when it was opened. */
export const historyTimeOf = (order: StoredOrder): string | null => order.paidAt ?? order.openedAt;

/** By the time the history shows, the latest first; by number where a copy has no time. */
function newestFirst(a: HistoryEntry, b: HistoryEntry): number {
  const at = historyTimeOf(a.order);
  const bt = historyTimeOf(b.order);
  if (at !== null && bt !== null && at !== bt) return Date.parse(bt) - Date.parse(at);
  return b.order.deviceOrderNo - a.order.deviceOrderNo;
}

/** The entries of one status (all when "all") whose order number contains `search`. */
export function filterHistory(
  entries: readonly HistoryEntry[],
  filter: HistoryFilter,
  search: string,
): HistoryEntry[] {
  const digits = search.replace(/\D/g, "");
  return entries.filter(
    (entry) =>
      (filter === "all" || entry.status === filter) &&
      (digits === "" || String(entry.order.deviceOrderNo).includes(digits)),
  );
}
