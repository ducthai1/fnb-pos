import { MAX_ENTERED_PRICE, MAX_WEIGHED_GRAMS } from "@fnb/domain";

/** What the drawer asks the cashier for: the price of one unit, or what the item weighed. */
export type EntryKind = "price" | "weight";

/**
 * The digits typed, read as the drawer's value: whole đồng or whole grams. Nothing typed and
 * a zero only leave the button off; past the domain's caps it is refused with a reason, so
 * an extra 0 never reaches the server as a ten-times price.
 */
export type EntryReading =
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly reason: "empty" | "zero" | "too_high" | "too_heavy" };

export function readEntry(kind: EntryKind, typed: string): EntryReading {
  const digits = typed.replace(/\D/g, "");
  if (digits === "") return { ok: false, reason: "empty" };
  const value = BigInt(digits);
  if (value === 0n) return { ok: false, reason: "zero" };
  if (kind === "price") {
    return value > MAX_ENTERED_PRICE
      ? { ok: false, reason: "too_high" }
      : { ok: true, value: Number(value) };
  }
  return value > BigInt(MAX_WEIGHED_GRAMS)
    ? { ok: false, reason: "too_heavy" }
    : { ok: true, value: Number(value) };
}

/** "150000" → "150.000": the digits grouped as the till writes money, for the big readout. */
export function groupDigits(typed: string): string {
  return typed.replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Weights a counter weighs most, as quick keys: 100 g, 200 g, 250 g, 500 g and 1 kg. */
export const QUICK_GRAMS = [100, 200, 250, 500, 1_000] as const;
