import { DomainError } from "../errors";
import { type RoundingMode, type Vnd, ZERO_VND, divideRounded, subtractVnd, vnd } from "../money";
import { ROUNDING_ERROR_CODES } from "./rounding-error-codes";

/**
 * Small notes (100 đ, 200 đ) are rarely handed out as change, so shops round what they
 * collect in cash to a step such as 500 đ or 1.000 đ.
 * - `cash_only`: only cash is rounded; a card or a QR transfer pays the exact amount
 * - `whole_order`: the shop rounds every bill, whatever the tender
 */
export interface CashRoundingRule {
  /** The note size to round to, in đồng; must be > 0 (e.g. 500n, 1000n). */
  step: Vnd;
  mode: RoundingMode;
  appliesTo: "cash_only" | "whole_order";
}

export type CashRoundingTender = "cash" | "non_cash";

/**
 * The nearest multiple of `step` per `mode`. Rounding is symmetric around zero (inherited from
 * divideRounded), so a refund line rounds to exactly the negative of its sale.
 */
export function roundToStep(amount: Vnd, step: Vnd, mode: RoundingMode): Vnd {
  assertStep(step);
  return vnd(divideRounded(amount, step, mode) * step);
}

/**
 * What to add to `amountToCollect` (negative = the customer pays less) so it lands on the step.
 * `amountToCollect` is the part being paid with this tender: when a bill is split between a
 * card and cash, only the cash part is passed in and rounded. The step is checked even when
 * the rule does not apply, so a broken branch setting fails on the first sale, not the first
 * cash sale.
 */
export function cashRoundingAdjustment(
  amountToCollect: Vnd,
  rule: CashRoundingRule,
  tender: CashRoundingTender,
): Vnd {
  assertStep(rule.step);
  if (rule.appliesTo === "cash_only" && tender === "non_cash") return ZERO_VND;
  return subtractVnd(roundToStep(amountToCollect, rule.step, rule.mode), amountToCollect);
}

function assertStep(step: Vnd): void {
  if (step <= 0n) {
    throw new DomainError(
      ROUNDING_ERROR_CODES.invalidStep,
      `cash rounding step must be a positive amount: ${step}`,
      { step },
    );
  }
}
