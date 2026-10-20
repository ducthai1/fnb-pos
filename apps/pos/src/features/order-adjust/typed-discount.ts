import { FULL_RATE, basisPoints } from "@fnb/domain";
import { typedAmount } from "../payment/cash-suggestions";
import type { DiscountInput } from "./discount-adjustment";

/** Quick rates offered first, in basis points. */
export const DISCOUNT_PRESETS = [500, 1000, 1500, 2000, 3000, 5000].map((rate) =>
  basisPoints(rate),
);

/**
 * What was typed as a discount: a percent from 0,01 to 100 ("12,5" or "12.5"), or whole
 * đồng. Null when it is neither, so nothing is given on a typo.
 */
export function typedDiscount(mode: "percent" | "amount", text: string): DiscountInput | null {
  if (mode === "amount") {
    const amount = typedAmount(text);
    return amount === null || amount <= 0n ? null : { kind: "amount", amount };
  }
  const match = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (match === null) return null;
  const rate = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (rate <= 0 || rate > FULL_RATE) return null;
  return { kind: "percent", rate: basisPoints(rate) };
}
