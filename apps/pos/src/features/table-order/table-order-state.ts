import type { CounterOrder } from "../order/counter-order";
import type { PricedCounterOrder } from "../order/price-counter-order";
import type { Recorded } from "../order/use-counter-order";
import type { RecordedOrder } from "../printing/print-commands";
import type { SlipOrder } from "../printing/sale-order";

/** A table's order as last saved, for its slips and the commands that follow them. */
export type SettledTableOrder = SlipOrder & RecordedOrder;

/** The order with what was recorded of it; null while nothing was ever saved. */
export function settledOrder(
  order: CounterOrder,
  priced: PricedCounterOrder | null,
  recorded: Recorded & { readonly preBillPrinted: boolean },
): SettledTableOrder | null {
  if (priced === null || recorded.businessDate === null) return null;
  return {
    order,
    priced,
    businessDate: recorded.businessDate,
    version: recorded.version,
    sent: recorded.sent ?? [],
    state: {
      status: "draft",
      version: recorded.version,
      businessDate: recorded.businessDate,
      chargeProfile: recorded.chargeProfile,
      payments: [],
      preBillPrinted: recorded.preBillPrinted,
    },
  };
}
