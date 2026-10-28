import type { MeasureUnit, Product } from "../catalog";
import { DomainError } from "../errors";
import {
  QUANTITY_SCALE,
  type Quantity,
  type Vnd,
  multiplyVndByQuantity,
  quantityFromThousandths,
} from "../money";
import { PRICING_ERROR_CODES } from "./pricing-error-codes";

/** Grams in one unit a weighed product is priced per. */
export const GRAMS_PER_MEASURE_UNIT: Readonly<Record<MeasureUnit, bigint>> = {
  kg: 1_000n,
  "100g": 100n,
};

/** The most one weighed line may hold: 100 kg, past anything a counter scale weighs. */
export const MAX_WEIGHED_GRAMS = 100_000;

/**
 * The line quantity of `grams` of a product priced per `unit`, counted in that unit: 350 g
 * of a product priced per kg is 0.35, per 100 g 3.5. Always exact, because a gram is a whole
 * number of thousandths of either unit. The weight is typed (or, later, read off a scale) in
 * whole grams: no decimal separator to misplace, and 0,35 kg cannot become 0,035 kg.
 */
export function weighedQuantity(grams: number, unit: MeasureUnit): Quantity {
  if (!Number.isSafeInteger(grams)) {
    throw new DomainError(
      PRICING_ERROR_CODES.weightNotWholeGrams,
      `a weight is whole grams: ${grams}`,
      { grams },
    );
  }
  const thousandths = (BigInt(grams) * QUANTITY_SCALE) / GRAMS_PER_MEASURE_UNIT[unit];
  return checkedWeight(quantityFromThousandths(thousandths), unit, grams);
}

/**
 * The whole grams a weighed line's quantity stands for, or the domain's refusal: nothing or
 * less, a part of a gram (0.0005 kg), more than MAX_WEIGHED_GRAMS. The server runs every
 * weighed line of a draft through it, so a till cannot sell 0 kg or a ton of cake.
 */
export function gramsOfWeighedQuantity(weight: Quantity, unit: MeasureUnit): number {
  const perUnit = GRAMS_PER_MEASURE_UNIT[unit];
  const gramsTimesScale = weight * perUnit;
  if (gramsTimesScale % QUANTITY_SCALE !== 0n) {
    throw new DomainError(
      PRICING_ERROR_CODES.weightNotWholeGrams,
      `${weight} thousandths of ${unit} is not a whole number of grams`,
      { quantity: weight, unit },
    );
  }
  const grams = Number(gramsTimesScale / QUANTITY_SCALE);
  checkedWeight(weight, unit, grams);
  return grams;
}

/**
 * What a weighed line costs: its price per unit times its weight in units, rounded half-up
 * to the đồng, which is how goodsLineAmounts prices every line (so the drawer's preview and
 * the order's total never differ). 200.000 đ/kg × 0,353 kg = 70.600 đ.
 */
export function weighedLineAmount(pricePerUnit: Vnd, weight: Quantity): Vnd {
  return multiplyVndByQuantity(pricePerUnit, weight, "half-up");
}

/** The unit a weighed product is priced per; null for any other product, or one without. */
export function measureUnitOf(product: Pick<Product, "pricingMode" | "measureUnit">) {
  return product.pricingMode === "weighed" ? (product.measureUnit ?? null) : null;
}

function checkedWeight(weight: Quantity, unit: MeasureUnit, grams: number): Quantity {
  if (weight <= 0n) {
    throw new DomainError(
      PRICING_ERROR_CODES.weightNotPositive,
      `a weighed line must weigh something: ${grams} g`,
      { grams, unit },
    );
  }
  if (grams > MAX_WEIGHED_GRAMS) {
    throw new DomainError(
      PRICING_ERROR_CODES.weightTooLarge,
      `${grams} g is more than one line may weigh (${MAX_WEIGHED_GRAMS} g)`,
      { grams, unit, maxGrams: MAX_WEIGHED_GRAMS },
    );
  }
  return weight;
}
