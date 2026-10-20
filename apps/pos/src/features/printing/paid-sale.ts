import type { OrderChargeProfile, SentLineState, Vnd } from "@fnb/domain";
import type { CounterOrder } from "../order/counter-order";
import type { PricedCounterOrder } from "../order/price-counter-order";
import type { AppliedPayment, Tender } from "../payment/tenders";

/** A counter order once paid: everything its slips print, as the domain priced it. */
export interface PaidSale {
  readonly order: CounterOrder;
  readonly priced: PricedCounterOrder;
  readonly chargeProfile: OrderChargeProfile;
  readonly businessDate: string;
  /** The order's version as the till last recorded it. */
  readonly version: number;
  /** As handed over: the bill prints the 200.000 given, not the 129.000 applied. */
  readonly tenders: readonly Tender[];
  readonly payments: readonly AppliedPayment[];
  readonly change: Vnd;
  readonly paidAt: number;
  readonly cashierName: string;
  /** What the stations already had when it was paid: a table's earlier rounds. */
  readonly sent?: readonly SentLineState[];
}
