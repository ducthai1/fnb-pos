import type { OrderChargeProfile } from "@fnb/domain";
import type { TillMenu } from "../menu/till-menu";
import { type CounterOrder, type SeatedTable, newCounterOrder } from "../order/counter-order";
import { type OrderOpening, freshOpening, openingFromStored } from "../order/order-opening";
import type { StoredOrder } from "../order/stored-order";

export { openingFromStored };

/** Where an order at a table starts from when its screen opens. */
export type TableOrderOpening = OrderOpening & {
  /** Commands the till recorded on the order before the screen opened whose refusal it shows. */
  readonly answersFor?: readonly string[];
  /** The order moved past the version its last pre-bill showed, at whichever till. */
  readonly preBillChanged?: boolean;
};

/** A seated table's order from the copy the till holds. */
export function tableOpeningFromStored(menu: TillMenu, stored: StoredOrder): TableOrderOpening {
  const printed = stored.preBillPrintedVersion;
  const preBillChanged = printed !== null && !stored.preBillPrinted && printed < stored.version;
  return { ...openingFromStored(menu, stored), preBillChanged };
}

/** A free table: a new dine-in order there, saved (and so seated) with its first item. */
export function openingForNewTable(
  orderId: string,
  deviceOrderNo: number,
  table: SeatedTable,
  chargeProfile: OrderChargeProfile,
): TableOrderOpening {
  const order: CounterOrder = {
    ...newCounterOrder(orderId, deviceOrderNo),
    serviceType: "dine_in",
    table,
  };
  return freshOpening(order, chargeProfile);
}
