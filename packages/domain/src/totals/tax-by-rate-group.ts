import {
  type BasisPoints,
  FULL_RATE,
  type Vnd,
  addVnd,
  applyRate,
  divideRounded,
  subtractVnd,
  vnd,
} from "../money";
import { allocateAmount } from "./allocate-amount";
import type { TaxGroupTotals } from "./order-totals-types";

export interface TaxableAmount {
  readonly rate: BasisPoints;
  /** After discount; tax-inclusive when prices include tax. Never negative. */
  readonly amount: Vnd;
}

export interface TaxByRateGroup {
  readonly breakdown: TaxGroupTotals[];
  /** The tax share of each input amount, in input order; each group's shares add up to its tax. */
  readonly shares: Vnd[];
}

/**
 * The invoice states VAT per rate, so tax is rounded once per rate group, never per line: three
 * 10.000 đ drinks at 8% inclusive carry 2.222 đ of tax, not 3 × 741 đ. The group tax is then
 * spread back over its amounts so each line's snapshot can be refunded on its own.
 */
export function taxByRateGroup(
  amounts: readonly TaxableAmount[],
  pricesIncludeTax: boolean,
): TaxByRateGroup {
  const groups = new Map<BasisPoints, number[]>();
  amounts.forEach(({ rate }, i) => groups.set(rate, [...(groups.get(rate) ?? []), i]));

  const shares = amounts.map(() => vnd(0n));
  const breakdown: TaxGroupTotals[] = [];
  for (const rate of [...groups.keys()].sort((a, b) => a - b)) {
    const members = groups.get(rate) ?? [];
    const weights = members.map((i) => ({ id: String(i), weight: amounts[i]?.amount ?? vnd(0n) }));
    const groupAmount = addVnd(...weights.map((w) => w.weight));
    const tax = groupTax(groupAmount, rate, pricesIncludeTax);
    const base = pricesIncludeTax ? subtractVnd(groupAmount, tax) : groupAmount;
    breakdown.push({ rate, base, tax });
    allocateAmount(tax, weights).forEach(({ amount }, k) => {
      const index = members[k];
      if (index !== undefined) shares[index] = amount;
    });
  }
  return { breakdown, shares };
}

/** Inclusive: the tax inside a gross amount is amount × rate / (100% + rate). */
function groupTax(amount: Vnd, rate: BasisPoints, pricesIncludeTax: boolean): Vnd {
  if (!pricesIncludeTax) return applyRate(amount, rate, "half-up");
  return vnd(divideRounded(amount * BigInt(rate), BigInt(FULL_RATE + rate), "half-up"));
}
