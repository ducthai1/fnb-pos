import { type OrderLine, basisPoints, computeOrderTotals, quantity, vnd } from "@fnb/domain";

/** One line of the expected order: an item, or an option under the item before it. */
export interface ExpectedLine {
  readonly unitPrice: number;
  /** Units of an item; units of an option per one unit of its item. */
  readonly quantity: number;
  readonly option?: true;
}

/**
 * What the customer owes for these lines by the domain alone, written down from the menu
 * the spec set up, at 8% VAT inside the prices (the shop's default charge profile).
 */
export function expectedAmountDue(lines: readonly ExpectedLine[]): bigint {
  let itemId = "";
  const orderLines = lines.map((line, index): OrderLine => {
    const id = `line-${index}`;
    if (line.option !== true) itemId = id;
    return {
      id,
      parentLineId: line.option === true ? itemId : null,
      lineType: line.option === true ? "modifier" : "item",
      productId: line.option === true ? null : `product-${index}`,
      variantId: null,
      modifierOptionId: line.option === true ? `option-${index}` : null,
      nameSnapshot: "",
      unitPrice: vnd(line.unitPrice),
      quantity: quantity(line.quantity),
      taxRate: basisPoints(800),
      note: null,
      priceSource: "base",
      reversesLineId: null,
    };
  });
  return computeOrderTotals(
    { lines: orderLines, serviceType: "takeaway" },
    { pricesIncludeTax: true, serviceCharge: null },
  ).amountDue;
}
