import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isDomainError } from "../errors";
import { MONEY_ERROR_CODES } from "./money-error-codes";
import {
  addQuantity,
  compareQuantity,
  negateQuantity,
  quantity,
  quantityFromThousandths,
  quantityToDecimalString,
  subtractQuantity,
} from "./quantity";

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return isDomainError(error) ? error.code : "not-a-domain-error";
  }
  return undefined;
}

describe("quantity", () => {
  it.each([
    ["2", 2000n],
    ["1.5", 1500n],
    ["0.125", 125n],
    ["0.1", 100n],
    ["-1", -1000n],
    [" 3 ", 3000n],
  ])("parses %j as %d thousandths", (input, expected) => {
    expect(quantity(input)).toBe(expected);
  });

  it("parses whole numbers and bigints as whole units", () => {
    expect(quantity(2)).toBe(2000n);
    expect(quantity(0.25)).toBe(250n);
    expect(quantity(4n)).toBe(4000n);
  });

  it("rejects more than three decimals instead of silently rounding", () => {
    expect(codeOf(() => quantity("0.1255"))).toBe(MONEY_ERROR_CODES.quantityTooPrecise);
  });

  it.each(["", "abc", "1,5", "1.", ".5", "1e3"])("rejects malformed input %j", (input) => {
    expect(codeOf(() => quantity(input))).toBe(MONEY_ERROR_CODES.invalidQuantity);
  });

  it("rejects non-finite numbers", () => {
    expect(codeOf(() => quantity(Number.NaN))).toBe(MONEY_ERROR_CODES.invalidQuantity);
    expect(codeOf(() => quantity(Number.POSITIVE_INFINITY))).toBe(
      MONEY_ERROR_CODES.invalidQuantity,
    );
  });

  it("prints a canonical decimal string without trailing zeros", () => {
    expect(quantityToDecimalString(quantity("1.500"))).toBe("1.5");
    expect(quantityToDecimalString(quantity("2"))).toBe("2");
    expect(quantityToDecimalString(quantity("0.005"))).toBe("0.005");
    expect(quantityToDecimalString(quantity("-0.25"))).toBe("-0.25");
  });

  it("round-trips through its decimal string", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: -(10n ** 12n), max: 10n ** 12n }), (thousandths) => {
        const q = quantityFromThousandths(thousandths);
        expect(quantity(quantityToDecimalString(q))).toBe(q);
      }),
    );
  });

  it("adds, subtracts, negates and compares exactly", () => {
    const a = quantity("1.25");
    const b = quantity("0.75");
    expect(addQuantity(a, b)).toBe(quantity("2"));
    expect(subtractQuantity(a, b)).toBe(quantity("0.5"));
    expect(negateQuantity(a)).toBe(quantity("-1.25"));
    expect(compareQuantity(a, b)).toBe(1);
    expect(compareQuantity(b, a)).toBe(-1);
    expect(compareQuantity(a, a)).toBe(0);
    expect(addQuantity()).toBe(0n);
  });
});
