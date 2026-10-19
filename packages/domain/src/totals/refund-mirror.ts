import { DomainError } from "../errors";
import { negateQuantity, negateVnd } from "../money";
import { type OrderLine, validateLineTree } from "../order";
import type { OrderTotals } from "./order-totals-types";
import { TOTALS_ERROR_CODES } from "./totals-error-codes";

/**
 * A refund is the mirror image of a sale: each root item is negative and names the sold line
 * it gives back, and children keep their per-unit quantities. Turning the root items positive
 * gives the order of the units given back, which is priced like any order and negated
 * (negateOrderTotals), so every split rounds exactly as the sale's did instead of rounding
 * negative amounts in some other direction.
 *
 * A refund that also sells something, or takes a discount of its own, is refused: its lines
 * would net sales against refunds, and neither the drawer nor the invoice can say which was
 * which. A sale and a refund are separate documents.
 */
export function mirroredRefundLines(
  lines: readonly OrderLine[],
  refundOfOrderId: string,
): OrderLine[] {
  validateLineTree(lines, { refundOfOrderId });
  for (const line of lines) {
    if (line.parentLineId !== null || line.reversesLineId !== null) continue;
    throw new DomainError(
      TOTALS_ERROR_CODES.mixedSaleAndRefund,
      `a refund only gives back sold items; ${line.lineType} line ${line.id} reverses nothing`,
      { lineId: line.id, lineType: line.lineType, refundOfOrderId },
    );
  }
  return lines.map((line) =>
    line.reversesLineId === null
      ? line
      : { ...line, quantity: negateQuantity(line.quantity), reversesLineId: null },
  );
}

/** Every amount with its sign flipped; rates and line ids stay. */
export function negateOrderTotals(totals: OrderTotals): OrderTotals {
  return {
    lines: totals.lines.map((l) => ({
      lineId: l.lineId,
      gross: negateVnd(l.gross),
      discountAllocated: negateVnd(l.discountAllocated),
      net: negateVnd(l.net),
      tax: negateVnd(l.tax),
    })),
    grossTotal: negateVnd(totals.grossTotal),
    discountTotal: negateVnd(totals.discountTotal),
    netTotal: negateVnd(totals.netTotal),
    serviceCharge: negateVnd(totals.serviceCharge),
    serviceChargeTax: negateVnd(totals.serviceChargeTax),
    taxBreakdown: totals.taxBreakdown.map((g) => ({
      rate: g.rate,
      base: negateVnd(g.base),
      tax: negateVnd(g.tax),
    })),
    taxTotal: negateVnd(totals.taxTotal),
    amountDue: negateVnd(totals.amountDue),
  };
}
