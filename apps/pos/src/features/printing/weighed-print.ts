import {
  type MeasureUnit,
  type Quantity,
  gramsOfWeighedQuantity,
  measureUnitOf,
} from "@fnb/domain";
import type { TillMenu } from "../menu/till-menu";

/**
 * What a slip prints for a weighed item in place of its units: the grams and what the price
 * is per, in the unit the line was priced per (`lineUnit`), so a unit changed on the menu
 * since never misprints it; a line from a server too old to say reads the product's unit.
 * Null for an item not sold by weight, and for a quantity that is no whole number of grams in
 * that unit: the slip then prints the units.
 */
export function weighedOnSlip(
  menu: TillMenu,
  productId: string | null,
  units: Quantity,
  lineUnit?: MeasureUnit,
): { readonly grams: number; readonly per: MeasureUnit } | null {
  const product = productId === null ? undefined : menu.productsById.get(productId);
  const per = lineUnit ?? (product === undefined ? null : measureUnitOf(product));
  if (per === null) return null;
  try {
    return { grams: gramsOfWeighedQuantity(units, per), per };
  } catch {
    return null;
  }
}
