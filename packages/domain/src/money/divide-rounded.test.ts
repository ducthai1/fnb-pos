import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isDomainError } from "../errors";
import { type RoundingMode, divideRounded } from "./divide-rounded";
import { MONEY_ERROR_CODES } from "./money-error-codes";

const MODES: RoundingMode[] = ["down", "up", "half-up", "half-even"];

describe("divideRounded", () => {
  it.each([
    // numerator, denominator, down, up, half-up, half-even
    [10n, 4n, 2n, 3n, 3n, 2n], // 2.5
    [14n, 4n, 3n, 4n, 4n, 4n], // 3.5
    [11n, 4n, 2n, 3n, 3n, 3n], // 2.75
    [9n, 4n, 2n, 3n, 2n, 2n], // 2.25
    [8n, 4n, 2n, 2n, 2n, 2n], // exact
    [-10n, 4n, -2n, -3n, -3n, -2n], // -2.5 rounds symmetrically
    [10n, -4n, -2n, -3n, -3n, -2n],
    [-10n, -4n, 2n, 3n, 3n, 2n],
  ])("%d / %d rounds per mode", (n, d, down, up, halfUp, halfEven) => {
    expect(divideRounded(n, d, "down")).toBe(down);
    expect(divideRounded(n, d, "up")).toBe(up);
    expect(divideRounded(n, d, "half-up")).toBe(halfUp);
    expect(divideRounded(n, d, "half-even")).toBe(halfEven);
  });

  it("rejects division by zero with a domain error", () => {
    expect(() => divideRounded(1n, 0n, "down")).toThrow();
    try {
      divideRounded(1n, 0n, "down");
    } catch (error) {
      expect(isDomainError(error, MONEY_ERROR_CODES.divisionByZero)).toBe(true);
    }
  });

  const numerator = fc.bigInt({ min: -(10n ** 15n), max: 10n ** 15n });
  const denominator = fc.bigInt({ min: 1n, max: 10n ** 6n });

  it("never lands more than one step from the exact quotient", () => {
    fc.assert(
      fc.property(numerator, denominator, fc.constantFrom(...MODES), (n, d, mode) => {
        const q = divideRounded(n, d, mode);
        // |q·d − n| < d  ⇔  q is the floor or the ceiling of n/d
        const error = q * d - n;
        expect(error < d && error > -d).toBe(true);
      }),
    );
  });

  it("is symmetric: a negated amount rounds to the negated result", () => {
    fc.assert(
      fc.property(numerator, denominator, fc.constantFrom(...MODES), (n, d, mode) => {
        expect(divideRounded(-n, d, mode)).toBe(-divideRounded(n, d, mode));
      }),
    );
  });

  it("returns the exact quotient whenever the division is exact", () => {
    fc.assert(
      fc.property(numerator, denominator, fc.constantFrom(...MODES), (n, d, mode) => {
        expect(divideRounded(n * d, d, mode)).toBe(n);
      }),
    );
  });
});
