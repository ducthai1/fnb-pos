import { moneyToWire } from "@fnb/contracts";
import {
  type OrderLine,
  type OrderLineType,
  type PriceSource,
  type ServiceType,
  basisPoints,
  computeOrderTotals,
  quantity,
  vnd,
} from "@fnb/domain";
import type { OrderView } from "./order-commands";

/**
 * What the till asks the customer to pay for the order it shows, computed by the domain as
 * the POS does: never added up by hand in a test.
 */
export function amountDueOf(order: OrderView): number {
  if (order.chargeProfile.serviceCharge !== null) throw new Error("no service charge in scenarios");
  const lines = order.lines.map((line): OrderLine => ({
    id: line.id,
    parentLineId: line.parentLineId,
    lineType: line.lineType as OrderLineType,
    productId: line.productId,
    variantId: line.variantId,
    modifierOptionId: line.modifierOptionId,
    nameSnapshot: line.nameSnapshot,
    unitPrice: vnd(BigInt(line.unitPrice)),
    quantity: quantity(line.quantity),
    taxRate: basisPoints(line.taxRate),
    note: line.note,
    priceSource: line.priceSource as PriceSource,
    reversesLineId: line.reversesLineId,
  }));
  const totals = computeOrderTotals(
    { lines, serviceType: order.serviceType as ServiceType },
    { pricesIncludeTax: order.chargeProfile.pricesIncludeTax, serviceCharge: null },
  );
  return moneyToWire(totals.amountDue);
}
