import type { CounterOrder } from "../order/counter-order";
import type { PricedCounterOrder } from "../order/price-counter-order";
import { type TillPlace, businessDateAt } from "../order/till-command";
import type { CounterOrderSession } from "../order/use-counter-order";
import type { PaidSale } from "../printing/paid-sale";
import { payOrderCommand } from "./pay-order-command";
import { type Tender, paymentsToSend, settleTenders } from "./tenders";

/** Asked to pay while money is still owed: the screen offers no such button. */
export class StillOwedError extends Error {
  constructor() {
    super("the tenders do not cover the amount due");
    this.name = "StillOwedError";
  }
}

/**
 * Records order.pay after the draft's last save, into the shift the drawer is in, and
 * returns the sale its slips print. The amount asked for is the one the draft was priced
 * at when it was last saved, which is what the server's total will be.
 */
export async function paySale(input: {
  session: Pick<CounterOrderSession, "record" | "recorded">;
  place: TillPlace;
  order: CounterOrder;
  priced: PricedCounterOrder;
  tenders: readonly Tender[];
  shiftId: string;
  cashierName: string;
  at: number;
}): Promise<PaidSale> {
  const { session, place, order, priced, tenders, at } = input;
  const amountDue = priced.totals.amountDue;
  const settlement = settleTenders(amountDue, tenders);
  const payments = paymentsToSend(amountDue, settlement);
  if (payments === null) throw new StillOwedError();
  const state = session.recorded();
  const sale: PaidSale = {
    order,
    priced,
    chargeProfile: state.chargeProfile,
    businessDate: state.businessDate ?? businessDateAt(place, at),
    version: state.version + 1,
    tenders,
    payments,
    change: settlement.change,
    paidAt: at,
    cashierName: input.cashierName,
    sent: state.sent ?? [],
  };
  const orderState = { ...sale, status: "paid" as const, sent: sale.sent ?? [] };
  await session.record(
    payOrderCommand(place, order, priced, orderState, payments, input.shiftId, at),
  );
  return sale;
}
