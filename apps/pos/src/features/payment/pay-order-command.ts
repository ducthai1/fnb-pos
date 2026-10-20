import { payOrderPayloadSchema } from "@fnb/contracts";
import type { LocalCommand } from "@fnb/sync-client";
import type { CounterOrder } from "../order/counter-order";
import { type TillOrderState, tillOrderSnapshot } from "../order/order-snapshot-for-till";
import type { PricedCounterOrder } from "../order/price-counter-order";
import { type TillPlace, moneyToWire, tillCommand } from "../order/till-command";
import type { AppliedPayment } from "./tenders";

/**
 * order.pay with what the customer was asked for (the domain's amount due on the draft as
 * last saved) and the shift the drawer is in: the server recomputes the total and refuses
 * the payment if another till changed the order since.
 */
export function payOrderCommand(
  place: TillPlace,
  order: CounterOrder,
  priced: PricedCounterOrder,
  state: TillOrderState,
  payments: readonly AppliedPayment[],
  shiftId: string,
  at: number,
): LocalCommand {
  const payload = {
    orderId: order.orderId,
    payments: payments.map((payment) => ({
      method: payment.method,
      amount: moneyToWire(payment.amount),
    })),
    expectedAmountDue: moneyToWire(priced.totals.amountDue),
    shiftId,
  };
  return tillCommand(place, "order.pay", payOrderPayloadSchema, payload, at, {
    entity: "order",
    entityId: order.orderId,
    optimistic: tillOrderSnapshot(place, order, priced, { ...state, status: "paid", payments }),
  });
}
