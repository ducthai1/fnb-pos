import { type Vnd, formatVnd, vnd } from "@fnb/domain";

const PLAIN = /^\d+$/;
// "35.000", "1,250,000", "35 000": whole groups of three only, so "35.5" is refused rather
// than read as 355 đồng or 35 đồng.
const GROUPED = /^\d{1,3}(?:[.,\s]\d{3})+$/;

/**
 * Whole đồng typed by a person, or null when the text is not one. Money travels as a JSON
 * number, so anything past the largest exact integer is refused here, not rounded.
 */
export function parseAmountText(text: string): Vnd | null {
  const trimmed = text.trim();
  if (!PLAIN.test(trimmed) && !GROUPED.test(trimmed)) return null;
  const digits = BigInt(trimmed.replace(/[.,\s]/g, ""));
  if (digits > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return vnd(digits);
}

/** An amount for an input box: the domain's grouping ("35.000"), without the currency sign. */
export function amountInputText(amount: number | null): string {
  if (amount === null) return "";
  return formatVnd(vnd(BigInt(amount))).replace(/\s*₫$/u, "");
}

/** A whole number typed in a limit box (min, max, per-option cap), or null. */
export function parseCountText(text: string): number | null {
  const trimmed = text.trim();
  if (!PLAIN.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}
