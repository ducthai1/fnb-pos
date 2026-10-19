import { DomainError } from "../errors";
import { MONEY_ERROR_CODES } from "./money-error-codes";

declare const basisPointsBrand: unique symbol;

/** A rate in basis points: 10000 = 100%, 800 = 8% VAT. Integers keep tax and discount maths exact. */
export type BasisPoints = number & { readonly [basisPointsBrand]: true };

export const FULL_RATE = 10_000;

export function basisPoints(value: number): BasisPoints {
  if (!Number.isSafeInteger(value) || value < 0 || value > FULL_RATE) {
    throw new DomainError(
      MONEY_ERROR_CODES.invalidRate,
      `rate must be an integer between 0 and ${FULL_RATE} basis points: ${value}`,
    );
  }
  return value as BasisPoints;
}

/** 8 → 800, 8.5 → 850. Percentages finer than 0.01% are rejected. */
export function percentRate(percent: number): BasisPoints {
  const scaled = Math.round(percent * 100);
  if (Math.abs(scaled - percent * 100) > 1e-9) {
    throw new DomainError(
      MONEY_ERROR_CODES.invalidRate,
      `percent has more than 2 decimals: ${percent}`,
    );
  }
  return basisPoints(scaled);
}
