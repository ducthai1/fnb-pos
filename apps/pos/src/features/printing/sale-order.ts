import { type LocalClockParts, type Order, type OrderLine, localClockParts } from "@fnb/domain";
import type { TillMenu } from "../menu/till-menu";
import { callNumberOf } from "../order/device-order-number";
import type { PaidSale } from "./paid-sale";

/** The paid sale as the domain's order, for the kitchen diff. */
export function domainOrderOf(sale: PaidSale): Order {
  return {
    id: sale.order.orderId,
    status: "paid",
    serviceType: sale.order.serviceType,
    channelKey: null,
    businessDate: sale.businessDate,
    lines: sale.priced.lines,
    refundOfOrderId: null,
    refundAmounts: null,
    version: sale.version,
  };
}

/** What every slip of the sale prints in its head. */
export interface SlipHead {
  readonly orderNumber: string;
  readonly callNumber: string;
  readonly tableName: string | null;
  readonly printedAt: LocalClockParts;
}

export function slipHead(menu: TillMenu, sale: PaidSale, at: number): SlipHead {
  return {
    orderNumber: String(sale.order.deviceOrderNo),
    callNumber: callNumberOf(sale.order.deviceOrderNo),
    tableName: sale.order.tableTag,
    printedAt: localClockParts(at, menu.branch.utcOffsetMinutes),
  };
}

/** The lines printed under an item: its options, per one unit of it. */
export const childrenOf = (lines: readonly OrderLine[], itemId: string) =>
  lines.filter((line) => line.parentLineId === itemId);

export const itemsOf = (lines: readonly OrderLine[]) =>
  lines.filter((line) => line.lineType === "item" && line.parentLineId === null);
