import type { BasisPoints, Vnd } from "../money";
import type { Order, ServiceType } from "../order";

/** Only what the totals read, so a caller holding a partial order (a draft on screen) can price it. */
export type OrderTotalsInput = Pick<Order, "lines" | "serviceType">;

export interface ServiceChargeRule {
  readonly rate: BasisPoints;
  /** Usually dine-in only: a takeaway customer is not served at a table. */
  readonly appliesTo: readonly ServiceType[];
  readonly base: "before_discount" | "after_discount";
  /** The service charge is a taxable supply of its own and joins the tax group of this rate. */
  readonly taxRate: BasisPoints;
}

export interface OrderChargeProfile {
  /**
   * true: menu prices already contain VAT and the tax is carved out of them (what a café prints);
   * false: VAT is added on top of the prices.
   */
  readonly pricesIncludeTax: boolean;
  readonly serviceCharge: ServiceChargeRule | null;
}

/**
 * The snapshot stored on a goods line (item, modifier, combo component). Discount lines are not
 * listed: their amount is spread over the goods lines they reduce, which is where a refund or a
 * sales report needs it. `discountAllocated` is the reduction as a positive amount, so
 * `net = gross - discountAllocated`; `tax` is inside `net` when prices include tax, on top of it
 * otherwise.
 */
export interface LineTotals {
  readonly lineId: string;
  readonly gross: Vnd;
  readonly discountAllocated: Vnd;
  readonly net: Vnd;
  readonly tax: Vnd;
}

/**
 * One row of the invoice's "summary by tax rate". `base` is the taxable value WITHOUT tax in both
 * modes (for tax-inclusive prices it is the group amount minus the tax carved out), so
 * `base + tax` is what the customer pays for that rate.
 */
export interface TaxGroupTotals {
  readonly rate: BasisPoints;
  readonly base: Vnd;
  readonly tax: Vnd;
}

export interface OrderTotals {
  /** Goods lines in the order they appear on the order. */
  readonly lines: readonly LineTotals[];
  readonly grossTotal: Vnd;
  /** Every discount as a positive amount: `netTotal = grossTotal - discountTotal`. */
  readonly discountTotal: Vnd;
  readonly netTotal: Vnd;
  readonly serviceCharge: Vnd;
  /** The service charge's share of its tax group, so `Σ lines.tax + serviceChargeTax = taxTotal`. */
  readonly serviceChargeTax: Vnd;
  /** Sorted by rate, ascending. */
  readonly taxBreakdown: readonly TaxGroupTotals[];
  readonly taxTotal: Vnd;
  readonly amountDue: Vnd;
}
