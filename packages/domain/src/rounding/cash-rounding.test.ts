import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isDomainError } from "../errors";
import { type RoundingMode, type Vnd, vnd } from "../money";
import { type CashRoundingRule, cashRoundingAdjustment, roundToStep } from "./cash-rounding";
import { ROUNDING_ERROR_CODES } from "./rounding-error-codes";

const MODES: RoundingMode[] = ["down", "up", "half-up", "half-even"];

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return isDomainError(error) ? error.code : "not-a-domain-error";
  }
  return undefined;
}

function rule(
  step: number,
  mode: RoundingMode,
  appliesTo: CashRoundingRule["appliesTo"],
): CashRoundingRule {
  return { step: vnd(step), mode, appliesTo };
}

describe("roundToStep", () => {
  it("rounds 45.200 to 45.000 at a 500 step, half-up", () => {
    expect(roundToStep(vnd(45_200), vnd(500), "half-up")).toBe(vnd(45_000));
  });

  it("rounds 45.250 to 45.500 at a 500 step, half-up: a tie goes away from zero", () => {
    expect(roundToStep(vnd(45_250), vnd(500), "half-up")).toBe(vnd(45_500));
  });

  it.each<[number, number, RoundingMode, number]>([
    [45_200, 500, "down", 45_000],
    [45_200, 500, "up", 45_500],
    [45_000, 500, "up", 45_000],
    [45_999, 1_000, "down", 45_000],
    [45_001, 1_000, "up", 46_000],
    [45_499, 1_000, "half-up", 45_000],
    [45_500, 1_000, "half-up", 46_000],
    [44_500, 1_000, "half-even", 44_000],
    [45_500, 1_000, "half-even", 46_000],
  ])("rounds %d at a step of %d, %s, to %d", (amount, step, mode, expected) => {
    expect(roundToStep(vnd(amount), vnd(step), mode)).toBe(vnd(expected));
  });

  it("rounds a refund to exactly the negative of its sale", () => {
    expect(roundToStep(vnd(-45_250), vnd(500), "half-up")).toBe(vnd(-45_500));
    expect(roundToStep(vnd(-45_200), vnd(500), "half-up")).toBe(vnd(-45_000));
    expect(roundToStep(vnd(-45_200), vnd(500), "down")).toBe(vnd(-45_000));
  });

  it.each([0, -500])("refuses a step of %d", (step) => {
    expect(codeOf(() => roundToStep(vnd(45_200), vnd(step), "half-up"))).toBe(
      ROUNDING_ERROR_CODES.invalidStep,
    );
  });
});

describe("cashRoundingAdjustment", () => {
  it("takes 200 off a 45.200 cash payment when cash rounds to 500", () => {
    const cashOnly = rule(500, "half-up", "cash_only");
    expect(cashRoundingAdjustment(vnd(45_200), cashOnly, "cash")).toBe(vnd(-200));
    expect(cashRoundingAdjustment(vnd(45_250), cashOnly, "cash")).toBe(vnd(250));
  });

  it("leaves a card or transfer payment exact under a cash-only rule", () => {
    const cashOnly = rule(500, "half-up", "cash_only");
    expect(cashRoundingAdjustment(vnd(45_200), cashOnly, "non_cash")).toBe(vnd(0));
  });

  it("rounds a card payment too when the shop rounds every bill", () => {
    const wholeOrder = rule(500, "half-up", "whole_order");
    expect(cashRoundingAdjustment(vnd(45_250), wholeOrder, "non_cash")).toBe(vnd(250));
  });

  it("is zero when the amount already sits on the step", () => {
    const cashOnly = rule(1_000, "up", "cash_only");
    expect(cashRoundingAdjustment(vnd(45_000), cashOnly, "cash")).toBe(vnd(0));
  });

  it.each([0, -500])("refuses a step of %d even when the rule would not apply", (step) => {
    const broken = rule(step, "half-up", "cash_only");
    expect(codeOf(() => cashRoundingAdjustment(vnd(45_200), broken, "non_cash"))).toBe(
      ROUNDING_ERROR_CODES.invalidStep,
    );
  });

  const amount = fc.bigInt({ min: -(10n ** 12n), max: 10n ** 12n }).map((n): Vnd => vnd(n));
  const step = fc
    .oneof(fc.constantFrom(100n, 200n, 500n, 1_000n, 5_000n), fc.bigInt({ min: 1n, max: 100_000n }))
    .map((n): Vnd => vnd(n));
  const mode = fc.constantFrom(...MODES);
  const anyRule = fc.record({
    step,
    mode,
    appliesTo: fc.constantFrom<CashRoundingRule["appliesTo"]>("cash_only", "whole_order"),
  });
  const tender = fc.constantFrom<"cash" | "non_cash">("cash", "non_cash");

  it("lands on a multiple of the step and moves the amount by less than one step", () => {
    fc.assert(
      fc.property(amount, anyRule, tender, (a, r, t) => {
        const adjustment = cashRoundingAdjustment(a, r, t);
        const collected = a + adjustment;
        const applies = r.appliesTo === "whole_order" || t === "cash";
        if (applies) expect(collected % r.step).toBe(0n);
        else expect(adjustment).toBe(0n);
        expect(adjustment < r.step && adjustment > -r.step).toBe(true);
      }),
    );
  });

  it("rounds a negated amount to the negated result", () => {
    fc.assert(
      fc.property(amount, step, mode, (a, s, m) => {
        expect(roundToStep(vnd(-a), s, m)).toBe(-roundToStep(a, s, m));
      }),
    );
  });
});
