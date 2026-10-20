import { type Vnd, computeOrderTotals } from "@fnb/domain";
import type { TillMenu } from "../menu/till-menu";
import type { CartLine } from "./counter-order";
import { pricedLines } from "./price-counter-order";

/**
 * What the line will cost as chosen so far, priced and totalled by the domain like the cart;
 * null while the choices are not yet a valid line (a required group still empty).
 */
export function linePreviewTotal(menu: TillMenu, line: CartLine, at: number): Vnd | null {
  try {
    const lines = pricedLines(menu, line, at);
    // Takeaway: a service charge belongs to the order, not to the line on the picker.
    return computeOrderTotals(
      { lines, serviceType: "takeaway" },
      {
        pricesIncludeTax: true,
        serviceCharge: null,
      },
    ).grossTotal;
  } catch {
    return null;
  }
}
