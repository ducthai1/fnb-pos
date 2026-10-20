import {
  type Vnd,
  ZERO_VND,
  compareVnd,
  divideRounded,
  multiplyVndByQuantity,
  quantity,
  vnd,
} from "@fnb/domain";

/** The notes customers pay with: what a quick key rounds the amount up to. */
const ROUND_TO: readonly Vnd[] = [10_000, 20_000, 50_000, 100_000, 200_000, 500_000].map((n) =>
  vnd(n),
);

/**
 * Quick keys for cash: the exact amount, then the amount rounded up to each common note
 * (a 129.000 bill is paid with 130.000, 150.000, 200.000 or 500.000), smallest first.
 */
export function cashSuggestions(remaining: Vnd, limit = 5): Vnd[] {
  if (compareVnd(remaining, ZERO_VND) <= 0) return [];
  const amounts = [remaining];
  for (const note of ROUND_TO) {
    const notes = divideRounded(remaining, note, "up");
    amounts.push(multiplyVndByQuantity(note, quantity(notes), "down"));
  }
  const unique = [...new Set(amounts)].sort(compareVnd);
  return unique.slice(0, limit);
}

/** Digits typed on the cash field as an amount; null when it is not one. */
export function typedAmount(text: string): Vnd | null {
  const digits = text.replace(/[.\s]/g, "");
  if (!/^\d{1,11}$/.test(digits)) return null;
  return vnd(BigInt(digits));
}
