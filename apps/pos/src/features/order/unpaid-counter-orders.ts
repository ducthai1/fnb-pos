import { type Vnd, quantityToDecimalString } from "@fnb/domain";
import type { SyncClient } from "@fnb/sync-client";
import { useMemo } from "react";
import { orderHistory } from "../history/order-history";
import { useOrderViews } from "../history/use-order-views";
import type { StoredOrder } from "./stored-order";

/** A counter order of this till that was never paid, left behind by a reload or a walk-off. */
export interface UnpaidCounterOrder {
  readonly order: StoredOrder;
  /** Dishes and drinks on it: a weighing counts as one. */
  readonly items: number;
  readonly amountDue: Vnd;
}

/** Items of the order, units counted whole (a weighing is one). */
function itemsOn(order: StoredOrder): number {
  return order.lines
    .filter(
      (line) =>
        line.lineType === "item" && line.parentLineId === null && line.reversesLineId === null,
    )
    .reduce(
      (sum, line) => sum + Math.max(1, Math.ceil(Number(quantityToDecimalString(line.quantity)))),
      0,
    );
}

/**
 * The drafts of the counter this till opened on business day `day`, with something on them:
 * what is left on the till when a page reloads (the counter starts a new order, never an old
 * one). Tables have their own sheet; `openOrderId` is the order on the counter right now.
 */
export function unpaidCounterOrders(
  views: Parameters<typeof orderHistory>[0],
  day: string,
  deviceId: string,
  openOrderId: string | null,
): UnpaidCounterOrder[] {
  return orderHistory(views, day, deviceId)
    .filter(
      (entry) =>
        entry.status === "draft" &&
        entry.ownTill &&
        entry.order.tableId === null &&
        entry.order.orderId !== openOrderId,
    )
    .map((entry) => ({
      order: entry.order,
      items: itemsOn(entry.order),
      amountDue: entry.amountDue,
    }))
    .filter((unpaid) => unpaid.items > 0)
    .sort((a, b) => a.order.deviceOrderNo - b.order.deviceOrderNo);
}

/** The unpaid counter orders of the till, kept current as its copies change. */
export function useUnpaidCounterOrders(
  client: Pick<SyncClient, "snapshots" | "onChange">,
  deviceId: string,
  day: string,
  openOrderId: string | null,
): UnpaidCounterOrder[] {
  const views = useOrderViews(client);
  return useMemo(
    () => unpaidCounterOrders(views, day, deviceId, openOrderId),
    [views, day, deviceId, openOrderId],
  );
}
