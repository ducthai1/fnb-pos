import type { OrderChargeProfile } from "@fnb/domain";
import { type CounterOrder, type SeatedTable, newCounterOrder } from "../order/counter-order";
import { type OrderOpening, freshOpening } from "../order/order-opening";

export { openingFromStored } from "../order/order-opening";

/** Where an order at a table starts from when its screen opens. */
export type TableOrderOpening = OrderOpening;

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
