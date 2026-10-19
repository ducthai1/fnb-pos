import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isDomainError } from "../errors";
import {
  ZERO_VND,
  addVnd,
  applyRate,
  compareVnd,
  formatVnd,
  multiplyVndByQuantity,
  negateVnd,
  subtractVnd,
  vnd,
} from "./money";
import { MONEY_ERROR_CODES } from "./money-error-codes";
import { quantity, quantityFromThousandths } from "./quantity";
import { basisPoints, percentRate } from "./rate";

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return isDomainError(error) ? error.code : "not-a-domain-error";
  }
  return undefined;
}

describe("vnd", () => {
  it("accepts whole đồng as number or bigint", () => {
    expect(vnd(45_000)).toBe(45_000n);
    expect(vnd(45_000n)).toBe(45_000n);
    expect(vnd(-5_000)).toBe(-5_000n);
  });

  it.each([0.5, 45_000.1, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    "rejects %d because money is never fractional or imprecise",
    (value) => {
      expect(codeOf(() => vnd(value))).toBe(MONEY_ERROR_CODES.notAnInteger);
    },
  );

  it("adds, subtracts, negates and compares exactly", () => {
    expect(addVnd(vnd(29_000), vnd(5_000), vnd(5_000))).toBe(39_000n);
    expect(addVnd()).toBe(ZERO_VND);
    expect(subtractVnd(vnd(39_000), vnd(4_000))).toBe(35_000n);
    expect(negateVnd(vnd(39_000))).toBe(-39_000n);
    expect(compareVnd(vnd(1), vnd(2))).toBe(-1);
    expect(compareVnd(vnd(2), vnd(1))).toBe(1);
    expect(compareVnd(vnd(2), vnd(2))).toBe(0);
  });
});

describe("multiplyVndByQuantity", () => {
  it("multiplies whole quantities without rounding", () => {
    expect(multiplyVndByQuantity(vnd(35_000), quantity(3), "half-up")).toBe(105_000n);
  });

  it("rounds weighed items by the chosen mode (0.333 kg × 120.000 đ/kg = 39.960 đ)", () => {
    expect(multiplyVndByQuantity(vnd(120_000), quantity("0.333"), "half-up")).toBe(39_960n);
    // 0.3335 kg cannot exist (3 decimals max), so use a price that leaves a remainder:
    // 0.125 kg × 99.999 đ/kg = 12.499,875 đ
    expect(multiplyVndByQuantity(vnd(99_999), quantity("0.125"), "half-up")).toBe(12_500n);
    expect(multiplyVndByQuantity(vnd(99_999), quantity("0.125"), "down")).toBe(12_499n);
  });

  it("gives a refund line exactly the negative of the sale line", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10_000_000n }),
        fc.bigInt({ min: 1n, max: 100_000n }),
        (price, thousandths) => {
          const sale = multiplyVndByQuantity(
            vnd(price),
            quantityFromThousandths(thousandths),
            "half-up",
          );
          const refund = multiplyVndByQuantity(
            vnd(price),
            quantityFromThousandths(-thousandths),
            "half-up",
          );
          expect(refund).toBe(-sale);
        },
      ),
    );
  });
});

describe("applyRate", () => {
  it("computes 8% VAT on 45.000 đ as 3.600 đ", () => {
    expect(applyRate(vnd(45_000), percentRate(8), "half-up")).toBe(3_600n);
  });

  it("rounds a rate that does not divide evenly (10% of 12.345 đ)", () => {
    expect(applyRate(vnd(12_345), basisPoints(1_000), "half-up")).toBe(1_235n);
    expect(applyRate(vnd(12_345), basisPoints(1_000), "down")).toBe(1_234n);
  });

  it("returns the full amount at 100% and zero at 0%", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: -(10n ** 12n), max: 10n ** 12n }), (amount) => {
        expect(applyRate(vnd(amount), basisPoints(10_000), "half-up")).toBe(amount);
        expect(applyRate(vnd(amount), basisPoints(0), "half-up")).toBe(0n);
      }),
    );
  });
});

describe("rates", () => {
  it("converts percentages with up to two decimals", () => {
    expect(percentRate(8)).toBe(800);
    expect(percentRate(8.5)).toBe(850);
    expect(percentRate(0.01)).toBe(1);
  });

  it.each([-1, 10_001, 1.5])("rejects %d basis points", (value) => {
    expect(codeOf(() => basisPoints(value))).toBe(MONEY_ERROR_CODES.invalidRate);
  });

  it("rejects percentages finer than 0.01%", () => {
    expect(codeOf(() => percentRate(8.125))).toBe(MONEY_ERROR_CODES.invalidRate);
  });
});

describe("formatVnd", () => {
  it.each([
    [45_000n, "45.000\u00a0₫"],
    [0n, "0\u00a0₫"],
    [999n, "999\u00a0₫"],
    [1_000n, "1.000\u00a0₫"],
    [1_234_567n, "1.234.567\u00a0₫"],
    [-5_000n, "-5.000\u00a0₫"],
  ])("formats %d as %j", (amount, expected) => {
    expect(formatVnd(vnd(amount))).toBe(expected);
  });
});
