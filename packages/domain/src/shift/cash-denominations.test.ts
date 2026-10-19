import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type Vnd, addVnd, vnd } from "../money";
import { codeOf } from "../order/order-line-test-fixtures";
import {
  type DenominationCount,
  VND_DENOMINATIONS,
  confirmCount,
  countedTotal,
} from "./cash-denominations";
import { SHIFT_ERROR_CODES as C } from "./shift-error-codes";

const notes = (...pairs: [number, number][]): DenominationCount[] =>
  pairs.map(([denomination, pieces]) => ({ denomination: vnd(denomination), pieces }));

describe("countedTotal", () => {
  it("adds each denomination times its pieces", () => {
    expect(countedTotal(notes([500_000, 2], [50_000, 3], [2_000, 4], [500, 1]))).toBe(
      vnd(1_158_500),
    );
  });

  it("comes to nothing for an empty drawer, and for denominations counted at zero", () => {
    expect(countedTotal([])).toBe(vnd(0));
    expect(countedTotal(notes([100_000, 0]))).toBe(vnd(0));
  });

  it("takes every note in circulation, from 500 đ to 500.000 đ", () => {
    const one = VND_DENOMINATIONS.map((denomination) => ({ denomination, pieces: 1 }));
    expect(countedTotal(one)).toBe(vnd(888_500));
  });

  it("refuses a denomination that is not a note in circulation", () => {
    for (const value of [100, 200, 1_500, 25_000, 1_000_000]) {
      expect(codeOf(() => countedTotal(notes([value, 1])))).toBe(C.unknownDenomination);
    }
  });

  it("refuses a denomination counted twice rather than adding both rows", () => {
    expect(codeOf(() => countedTotal(notes([10_000, 2], [10_000, 3])))).toBe(
      C.duplicateDenomination,
    );
  });

  it("refuses a negative or fractional number of notes", () => {
    expect(codeOf(() => countedTotal(notes([10_000, -1])))).toBe(C.invalidPieces);
    expect(codeOf(() => countedTotal(notes([10_000, 1.5])))).toBe(C.invalidPieces);
  });
});

describe("confirmCount", () => {
  it("returns the stated amount when the notes add up to it", () => {
    expect(confirmCount(vnd(120_000), notes([100_000, 1], [20_000, 1]))).toBe(vnd(120_000));
  });

  it("refuses a stated amount the notes do not add up to", () => {
    expect(codeOf(() => confirmCount(vnd(130_000), notes([100_000, 1], [20_000, 1])))).toBe(
      C.countMismatch,
    );
  });
});

/** A drawer as a pile of single notes, then grouped the way the counting screen groups it. */
const pile = fc.array(fc.constantFrom(...VND_DENOMINATIONS), { maxLength: 200 });
const grouped = (notesInPile: readonly Vnd[]): DenominationCount[] => {
  const pieces = new Map<Vnd, number>();
  for (const note of notesInPile) pieces.set(note, (pieces.get(note) ?? 0) + 1);
  return [...pieces].map(([denomination, n]) => ({ denomination, pieces: n }));
};

describe("counting properties", () => {
  it("comes to the sum of the notes counted one by one, whatever order the rows are in", () => {
    fc.assert(
      fc.property(
        pile.chain((p) =>
          fc
            .shuffledSubarray(grouped(p), { minLength: grouped(p).length })
            .map((rows) => ({ p, rows })),
        ),
        ({ p, rows }) => {
          expect(countedTotal(rows)).toBe(addVnd(...p));
        },
      ),
    );
  });

  it("always comes to a whole number of 500 đ", () => {
    fc.assert(
      fc.property(pile, (p) => {
        expect(countedTotal(grouped(p)) % 500n).toBe(0n);
      }),
    );
  });
});
