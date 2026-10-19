import { describe, expect, it } from "vitest";
import { type Vnd, vnd } from "../money";
import { codeOf } from "../order/order-line-test-fixtures";
import { allocateAmount } from "./allocate-amount";
import { TOTALS_ERROR_CODES as C } from "./totals-error-codes";

const weights = (...values: number[]) => values.map((w, i) => ({ id: `w${i}`, weight: vnd(w) }));
const amounts = (total: number, ...values: number[]) =>
  allocateAmount(vnd(total), weights(...values)).map((share) => share.amount);
const v = (...values: number[]): Vnd[] => values.map(vnd);

describe("allocateAmount", () => {
  it("splits exactly in proportion when the division is exact", () => {
    expect(amounts(10_400, 90_000, 14_000)).toEqual(v(9_000, 1_400));
  });

  it("returns the shares under their ids, in input order", () => {
    expect(allocateAmount(vnd(30), weights(1, 2))).toEqual([
      { id: "w0", amount: vnd(10) },
      { id: "w1", amount: vnd(20) },
    ]);
  });

  it("gives the leftover đồng to the largest remainder, not to the first weight", () => {
    // 10 × 1/3 = 3.33 and 10 × 2/3 = 6.67: the second has the larger remainder
    expect(amounts(10, 1, 2)).toEqual(v(3, 7));
  });

  it("breaks a tie in remainders by input order, so the split is deterministic", () => {
    expect(amounts(100, 1, 1, 1)).toEqual(v(34, 33, 33));
    const reversed = allocateAmount(vnd(100), weights(1, 1, 1).reverse());
    expect(reversed.map((s) => [s.id, s.amount])).toEqual([
      ["w2", vnd(34)],
      ["w1", vnd(33)],
      ["w0", vnd(33)],
    ]);
  });

  it("never gives a đồng to a zero weight", () => {
    expect(amounts(5, 0, 3, 0, 2)).toEqual(v(0, 3, 0, 2));
    expect(amounts(7, 0, 1, 1)).toEqual(v(0, 4, 3));
  });

  it("splits a negative total as the mirror image of the positive one", () => {
    expect(amounts(-100, 1, 1, 1)).toEqual(v(-34, -33, -33));
    expect(amounts(-10, 1, 2)).toEqual(v(-3, -7));
  });

  it("allocates zero over anything, even over no weights at all", () => {
    expect(amounts(0, 0, 0)).toEqual(v(0, 0));
    expect(allocateAmount(vnd(0), [])).toEqual([]);
  });

  it("refuses a negative weight", () => {
    expect(codeOf(() => allocateAmount(vnd(10), weights(5, -1)))).toBe(C.negativeWeight);
    expect(codeOf(() => allocateAmount(vnd(0), weights(-1)))).toBe(C.negativeWeight);
  });

  it("refuses to allocate a non-zero total when there is no weight to carry it", () => {
    expect(codeOf(() => allocateAmount(vnd(10), weights(0, 0)))).toBe(C.nothingToAllocateTo);
    expect(codeOf(() => allocateAmount(vnd(-1), []))).toBe(C.nothingToAllocateTo);
  });
});
