import { vnd } from "@fnb/domain";
import { describe, expect, it } from "vitest";
import { cashSuggestions, typedAmount } from "./cash-suggestions";

describe("cash quick keys", () => {
  it("offers the exact amount and the notes it rounds up to, smallest first", () => {
    expect(cashSuggestions(vnd(129_000))).toEqual(
      [129_000, 130_000, 140_000, 150_000, 200_000].map((n) => vnd(n)),
    );
  });

  it("offers a round amount once, and nothing when nothing is owed", () => {
    expect(cashSuggestions(vnd(100_000))).toEqual([100_000, 200_000, 500_000].map((n) => vnd(n)));
    expect(cashSuggestions(vnd(0))).toEqual([]);
  });

  it("reads typed digits, with dots or spaces, and refuses anything else", () => {
    expect(typedAmount("200.000")).toBe(vnd(200_000));
    expect(typedAmount(" 50 000 ")).toBe(vnd(50_000));
    for (const bad of ["", "abc", "-5000", "1,5", "123456789012"])
      expect(typedAmount(bad)).toBeNull();
  });
});
