import { DomainError } from "../errors";
import { type Vnd, ZERO_VND, divideRounded, vnd } from "../money";
import { TOTALS_ERROR_CODES } from "./totals-error-codes";

export interface AllocationWeight {
  readonly id: string;
  readonly weight: Vnd;
}

export interface AllocatedShare {
  readonly id: string;
  readonly amount: Vnd;
}

/**
 * Splits `total` over `weights` in proportion, in whole đồng, so the shares add up to `total`
 * exactly. Each share starts at its exact share rounded toward zero; the đồng left over go one
 * each to the largest remainders, and a tie goes to the weight listed first, so the POS and the
 * server split identically. A negative total is split as the mirror image of the positive one,
 * so a refund reverses the sale share for share. Shares come back in the order of `weights`.
 */
export function allocateAmount(total: Vnd, weights: readonly AllocationWeight[]): AllocatedShare[] {
  let totalWeight = 0n;
  for (const { id, weight } of weights) {
    if (weight < 0n) {
      throw new DomainError(
        TOTALS_ERROR_CODES.negativeWeight,
        `allocation weight of ${id} is negative: ${weight}`,
        { id, weight },
      );
    }
    totalWeight += weight;
  }
  if (total === 0n) return weights.map(({ id }) => ({ id, amount: ZERO_VND }));
  if (totalWeight === 0n) {
    throw new DomainError(
      TOTALS_ERROR_CODES.nothingToAllocateTo,
      `cannot allocate ${total} over weights that add up to zero`,
      { total, weightCount: weights.length },
    );
  }

  const magnitude = total < 0n ? -total : total;
  const parts = weights.map(({ id, weight }, index) => {
    const share = divideRounded(magnitude * weight, totalWeight, "down");
    return { id, index, share, remainder: magnitude * weight - share * totalWeight };
  });
  let leftover = magnitude - parts.reduce((sum, part) => sum + part.share, 0n);
  const byRemainder = [...parts].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  // Remainders are each below totalWeight and add up to leftover × totalWeight, so more than
  // `leftover` weights have a positive remainder: a zero weight never receives a đồng.
  for (const part of byRemainder) {
    if (leftover === 0n) break;
    part.share += 1n;
    leftover -= 1n;
  }
  return parts.map(({ id, share }) => ({ id, amount: vnd(total < 0n ? -share : share) }));
}
