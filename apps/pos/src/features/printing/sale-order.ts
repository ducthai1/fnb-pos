import {
  type LocalClockParts,
  type Order,
  type OrderLine,
  type OrderStatus,
  type SentLineState,
  localClockParts,
} from "@fnb/domain";
import type { TillMenu } from "../menu/till-menu";
import { callNumberOf } from "../order/device-order-number";
import type { CounterOrder } from "../order/counter-order";
import type { PricedCounterOrder } from "../order/price-counter-order";

/** An order as its slips print it: a paid counter sale, or a table's draft as last saved. */
export interface SlipOrder {
  readonly order: CounterOrder;
  readonly priced: PricedCounterOrder;
  readonly businessDate: string;
  /** The order's version as the till last recorded it. */
  readonly version: number;
  /** What the stations already have of each item; nothing for a counter sale paid first. */
  readonly sent?: readonly SentLineState[];
}

/** The order as the domain's order, for the kitchen diff. */
export function domainOrderOf(sale: SlipOrder, status: OrderStatus = "paid"): Order {
  return {
    id: sale.order.orderId,
    status,
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

/** A seated order prints its table's name; a counter order the number it is brought to. */
export function slipHead(menu: TillMenu, sale: Pick<SlipOrder, "order">, at: number): SlipHead {
  return {
    orderNumber: String(sale.order.deviceOrderNo),
    callNumber: callNumberOf(sale.order.deviceOrderNo),
    tableName: sale.order.table?.name ?? sale.order.tableTag,
    printedAt: localClockParts(at, menu.branch.utcOffsetMinutes),
  };
}

/** The lines printed under an item: its options, per one unit of it. */
export const childrenOf = (lines: readonly OrderLine[], itemId: string) =>
  lines.filter((line) => line.parentLineId === itemId);

export const itemsOf = (lines: readonly OrderLine[]) =>
  lines.filter((line) => line.lineType === "item" && line.parentLineId === null);
