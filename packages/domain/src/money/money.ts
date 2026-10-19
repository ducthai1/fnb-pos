import { DomainError } from "../errors";
import { type RoundingMode, divideRounded } from "./divide-rounded";
import { MONEY_ERROR_CODES } from "./money-error-codes";
import { type Quantity, QUANTITY_SCALE } from "./quantity";
import { type BasisPoints, FULL_RATE } from "./rate";

declare const vndBrand: unique symbol;

/** An amount in whole Vietnamese đồng. VND has no minor unit in practice, so money is an integer. */
export type Vnd = bigint & { readonly [vndBrand]: true };

export function vnd(value: bigint | number): Vnd {
  if (typeof value === "bigint") return value as Vnd;
  if (!Number.isSafeInteger(value)) {
    throw new DomainError(MONEY_ERROR_CODES.notAnInteger, `money must be whole đồng: ${value}`);
  }
  return BigInt(value) as Vnd;
}

export const ZERO_VND = vnd(0n);

export function addVnd(...amounts: Vnd[]): Vnd {
  return amounts.reduce<bigint>((sum, amount) => sum + amount, 0n) as Vnd;
}

export function subtractVnd(a: Vnd, b: Vnd): Vnd {
  return (a - b) as Vnd;
}

export function negateVnd(amount: Vnd): Vnd {
  return -amount as Vnd;
}

export function compareVnd(a: Vnd, b: Vnd): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Unit price × quantity; only weighed items and fractional quantities ever need the rounding. */
export function multiplyVndByQuantity(unitPrice: Vnd, qty: Quantity, mode: RoundingMode): Vnd {
  return divideRounded(unitPrice * qty, QUANTITY_SCALE, mode) as Vnd;
}

/** amount × rate, e.g. 8% VAT on 45.000 đ = 3.600 đ. */
export function applyRate(amount: Vnd, rate: BasisPoints, mode: RoundingMode): Vnd {
  return divideRounded(amount * BigInt(rate), BigInt(FULL_RATE), mode) as Vnd;
}

/**
 * "45.000 ₫". Grouping is done by hand rather than with Intl, because the POS runs
 * on Android WebViews whose ICU data differs, and receipts must print identically.
 */
export function formatVnd(amount: Vnd): string {
  const negative = amount < 0n;
  const digits = (negative ? -amount : amount).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${grouped}\u00a0₫`;
}
