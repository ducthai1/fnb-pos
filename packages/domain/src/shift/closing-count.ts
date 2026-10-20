import { DomainError } from "../errors";
import { type Vnd, compareVnd, negateVnd, subtractVnd } from "../money";
import type { PermissionAction } from "../permissions";
import { type ShiftCashLedger, expectedCash } from "./expected-cash";
import { SHIFT_ERROR_CODES } from "./shift-error-codes";

/** What closing a shift on a count comes to; difference is counted − expected. */
export interface ClosingAssessment {
  readonly expectedCash: Vnd;
  readonly countedCash: Vnd;
  readonly difference: Vnd;
  /**
   * True when the difference is beyond the shop's tolerance either way. A surplus counts as
   * much as a shortfall: an unexplained surplus is usually a sale that was never rung up.
   */
  readonly needsAcceptance: boolean;
}

/**
 * The action whoever accepts a difference beyond the tolerance must be allowed, naming the
 * difference itself (counted − expected): a manager who agreed to "0 đ" or "−9.000 đ" has
 * not agreed to "−29.000 đ", so an approval only covers the figure it was given for.
 */
export function acceptCloseDifference(difference: Vnd): PermissionAction {
  return { key: "accept_close_difference", difference };
}

/**
 * Compares the counted drawer with what the shift's cash book says it should hold. The
 * tolerance is inclusive: a shop allowing 5.000 đ accepts a 5.000 đ shortfall alone.
 */
export function assessClosingCount(
  ledger: ShiftCashLedger,
  countedCash: Vnd,
  tolerance: Vnd,
): ClosingAssessment {
  for (const [name, amount] of [
    ["counted cash", countedCash],
    ["tolerance", tolerance],
  ] as const) {
    if (amount < 0n) {
      throw new DomainError(SHIFT_ERROR_CODES.negativeAmount, `${name} is negative: ${amount}`, {
        amount,
      });
    }
  }
  const expected = expectedCash(ledger);
  const difference = subtractVnd(countedCash, expected);
  const magnitude = difference < 0n ? negateVnd(difference) : difference;
  return {
    expectedCash: expected,
    countedCash,
    difference,
    needsAcceptance: compareVnd(magnitude, tolerance) > 0,
  };
}
