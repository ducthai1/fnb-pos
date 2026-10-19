import { DomainError } from "../errors";
import { MONEY_ERROR_CODES } from "./money-error-codes";

/**
 * How an inexact division is turned into whole đồng.
 * - `down`: toward zero (truncate)
 * - `up`: away from zero
 * - `half-up`: nearest, ties away from zero (symmetric, so a refund line rounds
 *   to exactly the negative of the sale line)
 * - `half-even`: nearest, ties to the even neighbour (banker's rounding)
 */
export type RoundingMode = "down" | "up" | "half-up" | "half-even";

export function divideRounded(numerator: bigint, denominator: bigint, mode: RoundingMode): bigint {
  if (denominator === 0n) {
    throw new DomainError(MONEY_ERROR_CODES.divisionByZero, "division by zero");
  }
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = n / d;
  const remainder = n % d;

  let magnitude = quotient;
  if (remainder !== 0n) {
    const twiceRemainder = remainder * 2n;
    switch (mode) {
      case "down":
        break;
      case "up":
        magnitude = quotient + 1n;
        break;
      case "half-up":
        if (twiceRemainder >= d) magnitude = quotient + 1n;
        break;
      case "half-even":
        if (twiceRemainder > d || (twiceRemainder === d && quotient % 2n === 1n)) {
          magnitude = quotient + 1n;
        }
        break;
    }
  }
  return negative ? -magnitude : magnitude;
}
