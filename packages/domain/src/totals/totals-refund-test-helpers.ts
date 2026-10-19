import { quantity } from "../money";
import type { Order, RefundRequestLine } from "../order";
import type { OrderTotals } from "./order-totals-types";
import { orderLevel } from "./totals-void-test-helpers";

export const paid = (o: Order): Order => ({ ...o, status: "paid" });

export const units = (lineId: string, n: number): RefundRequestLine => ({
  lineId,
  quantity: quantity(n),
  restock: true,
});

/** What the customer gets back for a sale: every order-level amount of it, negative. */
export const negated = (t: OrderTotals) => ({
  ...orderLevel(t),
  grossTotal: -t.grossTotal,
  discountTotal: -t.discountTotal,
  netTotal: -t.netTotal,
  serviceCharge: -t.serviceCharge,
  serviceChargeTax: -t.serviceChargeTax,
  taxBreakdown: t.taxBreakdown.map((g) => ({ rate: g.rate, base: -g.base, tax: -g.tax })),
  taxTotal: -t.taxTotal,
  amountDue: -t.amountDue,
});
