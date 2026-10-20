import {
  type BuiltRefund,
  type OrderLine,
  QUANTITY_SCALE,
  type RefundRequestLine,
  type Vnd,
  addQuantity,
  buildRefund,
  computeOrderTotals,
  negateVnd,
  quantity,
  reversedQuantityOf,
  subtractQuantity,
} from "@fnb/domain";
import { newId } from "../ids/new-id";
import { type StoredOrder, domainOrderOf } from "../order/stored-order";

/** A sold item and how many of its units can still be given back. */
export interface RefundableLine {
  readonly item: OrderLine;
  /** Units sold, net of what was cancelled before payment. */
  readonly sold: number;
  /** Units not refunded yet. */
  readonly refundable: number;
}

/** Units of `itemId` the sale's own cancel lines and the refunds already took back. */
const takenBack = (sale: StoredOrder, refunds: readonly StoredOrder[], itemId: string) =>
  addQuantity(...[sale, ...refunds].map((order) => reversedQuantityOf(order.lines, itemId)));

/** Each sold item of a paid sale with what is left to refund of it. */
export function refundableLines(
  sale: StoredOrder,
  refunds: readonly StoredOrder[],
): RefundableLine[] {
  return sale.lines
    .filter(
      (line) =>
        line.lineType === "item" && line.parentLineId === null && line.reversesLineId === null,
    )
    .map((item) => {
      const sold = subtractQuantity(item.quantity, reversedQuantityOf(sale.lines, item.id));
      const left = subtractQuantity(item.quantity, takenBack(sale, refunds, item.id));
      return {
        item,
        sold: Number(sold / QUANTITY_SCALE),
        refundable: Number(left / QUANTITY_SCALE),
      };
    });
}

/** The units the cashier picked to give back, by sold item. */
export type RefundSelection = ReadonlyMap<string, number>;

export interface TillRefund {
  /** What was asked: sold items and units, as order.refund names them. */
  readonly request: readonly RefundRequestLine[];
  readonly built: BuiltRefund;
  /** What leaves the till, as the positive amount the customer is handed. */
  readonly payout: Vnd;
  /** The refund's own amount due: negative, as its payout is recorded. */
  readonly amountDue: Vnd;
}

/**
 * The refund the domain builds from the sale and every refund already made of it: what it
 * gives back is the sale's own share for those units (its discounts and tax included), the
 * amount the server will compute and require to the đồng. Throws the domain's refusal.
 */
export function planRefund(input: {
  sale: StoredOrder;
  refunds: readonly StoredOrder[];
  selection: RefundSelection;
  refundOrderId: string;
  businessDate: string;
}): TillRefund {
  const { sale } = input;
  const lines = [...input.selection]
    .filter(([, units]) => units > 0)
    .map(([lineId, units]) => ({ lineId, quantity: quantity(units), restock: false }));
  const built = buildRefund(
    domainOrderOf(sale),
    lines,
    input.refunds.map(domainOrderOf),
    { orderId: input.refundOrderId, newLineId: newId },
    input.businessDate,
    sale.chargeProfile,
  );
  const { amountDue } = computeOrderTotals(built.order, sale.chargeProfile);
  return { request: lines, built, amountDue, payout: negateVnd(amountDue) };
}
