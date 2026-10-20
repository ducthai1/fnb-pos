import {
  type OrderLine,
  type Quantity,
  type Vnd,
  computeOrderTotals,
  subtreeOf,
} from "@fnb/domain";

/**
 * What voided units were worth at their price before any discount: the gross the domain
 * gives an order holding only those units of the item, with its toppings and combo parts.
 * Gross does not depend on how tax is applied, so a plain profile prices it.
 */
export function voidedUnitsValue(
  lines: readonly OrderLine[],
  itemLineId: string,
  units: Quantity,
): Vnd {
  const goods = subtreeOf(lines, itemLineId).filter((line) => line.lineType !== "discount");
  const alone = goods.map((line) =>
    line.id === itemLineId ? { ...line, quantity: units, reversesLineId: null } : line,
  );
  const totals = computeOrderTotals(
    { lines: alone, serviceType: "takeaway" },
    { pricesIncludeTax: true, serviceCharge: null },
  );
  return totals.grossTotal;
}
