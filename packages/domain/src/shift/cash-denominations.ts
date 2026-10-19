import { DomainError } from "../errors";
import {
  type Vnd,
  ZERO_VND,
  addVnd,
  compareVnd,
  multiplyVndByQuantity,
  quantity,
  vnd,
} from "../money";
import { SHIFT_ERROR_CODES } from "./shift-error-codes";

/**
 * The notes a Vietnamese drawer holds, smallest first. Coins and the 100 / 200 đ notes have
 * left circulation, so a count listing them is a typo rather than money.
 */
export const VND_DENOMINATIONS: readonly Vnd[] = [
  500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000, 200_000, 500_000,
].map((value) => vnd(value));

/** How many notes of one denomination were counted. */
export interface DenominationCount {
  readonly denomination: Vnd;
  readonly pieces: number;
}

/**
 * The cash a count comes to. Each denomination appears at most once: a till that sends the
 * same note twice has merged its rows wrongly, and adding both would hide which row is right.
 */
export function countedTotal(counts: readonly DenominationCount[]): Vnd {
  const seen = new Set<bigint>();
  let total = ZERO_VND;
  for (const { denomination, pieces } of counts) {
    if (!VND_DENOMINATIONS.includes(denomination)) {
      throw new DomainError(
        SHIFT_ERROR_CODES.unknownDenomination,
        `not a note in circulation: ${denomination}`,
        { denomination },
      );
    }
    if (seen.has(denomination)) {
      throw new DomainError(
        SHIFT_ERROR_CODES.duplicateDenomination,
        `denomination counted twice: ${denomination}`,
        { denomination },
      );
    }
    if (!Number.isSafeInteger(pieces) || pieces < 0) {
      throw new DomainError(SHIFT_ERROR_CODES.invalidPieces, `not a number of notes: ${pieces}`, {
        denomination,
        pieces,
      });
    }
    seen.add(denomination);
    // Whole pieces, so the rounding mode never comes into play.
    total = addVnd(
      total,
      multiplyVndByQuantity(denomination, quantity(BigInt(pieces)), "half-even"),
    );
  }
  return total;
}

/**
 * The amount a count states, checked against its notes. The cashier types the total and the
 * notes on separate screens; when they disagree one of them is wrong, and keeping either
 * would settle the shift on a guess.
 */
export function confirmCount(stated: Vnd, counts: readonly DenominationCount[]): Vnd {
  const total = countedTotal(counts);
  if (compareVnd(total, stated) !== 0) {
    throw new DomainError(
      SHIFT_ERROR_CODES.countMismatch,
      `the notes add up to ${total}, not ${stated}`,
      { stated, counted: total },
    );
  }
  return total;
}
