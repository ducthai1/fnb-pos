import { DomainError } from "../errors";
import { MONEY_ERROR_CODES } from "./money-error-codes";

declare const quantityBrand: unique symbol;

/**
 * A quantity stored as an integer number of thousandths: grams, millilitres and
 * kilograms need three decimals, and integers keep stock and price maths exact.
 * One whole item is 1000n. Negative quantities exist on refund and void lines.
 */
export type Quantity = bigint & { readonly [quantityBrand]: true };

export const QUANTITY_SCALE = 1000n;

const DECIMAL_PATTERN = /^(-)?(\d+)(?:\.(\d+))?$/;

/** Parses "2", "1.5", "0.125", 2 or 2n (whole units). More than 3 decimals is rejected, not rounded. */
export function quantity(value: string | number | bigint): Quantity {
  if (typeof value === "bigint") return (value * QUANTITY_SCALE) as Quantity;
  const text = typeof value === "number" ? numberToPlainString(value) : value.trim();
  const match = DECIMAL_PATTERN.exec(text);
  if (!match) {
    throw new DomainError(MONEY_ERROR_CODES.invalidQuantity, `not a decimal quantity: ${text}`);
  }
  const [, sign, whole = "0", fraction = ""] = match;
  if (fraction.length > 3) {
    throw new DomainError(
      MONEY_ERROR_CODES.quantityTooPrecise,
      `quantity has more than 3 decimals: ${text}`,
    );
  }
  const thousandths = BigInt(whole) * QUANTITY_SCALE + BigInt(fraction.padEnd(3, "0"));
  return (sign ? -thousandths : thousandths) as Quantity;
}

export function quantityFromThousandths(thousandths: bigint): Quantity {
  return thousandths as Quantity;
}

export function addQuantity(...quantities: Quantity[]): Quantity {
  return quantities.reduce<bigint>((sum, q) => sum + q, 0n) as Quantity;
}

export function subtractQuantity(a: Quantity, b: Quantity): Quantity {
  return (a - b) as Quantity;
}

export function negateQuantity(q: Quantity): Quantity {
  return -q as Quantity;
}

export function compareQuantity(a: Quantity, b: Quantity): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Canonical string without trailing zeros: 1500n → "1.5", 2000n → "2". */
export function quantityToDecimalString(q: Quantity): string {
  const negative = q < 0n;
  const abs = negative ? -q : q;
  const whole = abs / QUANTITY_SCALE;
  const fraction = (abs % QUANTITY_SCALE).toString().padStart(3, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function numberToPlainString(value: number): string {
  if (!Number.isFinite(value)) {
    throw new DomainError(MONEY_ERROR_CODES.invalidQuantity, `not a finite quantity: ${value}`);
  }
  // toString() gives the shortest decimal that reads back as the same number, so its decimals
  // are the ones the caller meant. Below 1e-6 it switches to exponent notation; such a number
  // is never 0 (0 prints as "0"), so it has more than 3 decimals and is refused like 0.0001,
  // never rounded to a zero quantity. Huge numbers print as "1e+21" and fail the pattern.
  const text = value.toString();
  if (text.includes("e") && Math.abs(value) < 1) {
    throw new DomainError(
      MONEY_ERROR_CODES.quantityTooPrecise,
      `quantity has more than 3 decimals: ${text}`,
    );
  }
  return text;
}
