import { type Vnd, vnd } from "@fnb/domain";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { outcomeOf } from "../zod-issue-test-helpers";
import { moneySchema, moneyToWire } from "./money-schema";

const SAFE = BigInt(Number.MAX_SAFE_INTEGER);

describe("moneySchema", () => {
  it.each([0, 35_000, -12_500, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER])(
    "reads %d đồng as the same Vnd",
    (wire) => {
      expect(moneySchema.parse(wire)).toBe(BigInt(wire));
    },
  );

  it.each([
    ["a fraction of a đồng", 1.5],
    ["a string of digits", "35000"],
    ["a bigint", 35_000n],
    ["null", null],
  ])("refuses %s", (_label, wire) => {
    expect(outcomeOf(moneySchema, wire)).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: "invalid_type" })],
    });
  });

  it("refuses an amount JSON could not have carried exactly", () => {
    for (const wire of [Number.MAX_SAFE_INTEGER + 1, Number.MIN_SAFE_INTEGER - 1]) {
      expect(outcomeOf(moneySchema, wire)).toEqual({
        ok: false,
        issues: [expect.objectContaining({ code: wire > 0 ? "too_big" : "too_small" })],
      });
    }
    expect(outcomeOf(moneySchema, Number.POSITIVE_INFINITY).ok).toBe(false);
  });
});

describe("moneyToWire", () => {
  it("writes an amount as the plain JSON number of đồng", () => {
    expect(JSON.stringify({ total: moneyToWire(vnd(45_000)) })).toBe('{"total":45000}');
  });

  it("refuses an amount a JSON number would round, instead of sending a wrong total", () => {
    expect(() => moneyToWire(vnd(SAFE + 1n))).toThrow(RangeError);
    expect(() => moneyToWire(vnd(-SAFE - 1n))).toThrow(RangeError);
    expect(moneyToWire(vnd(SAFE))).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("round-trips every safe amount through JSON exactly", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: -SAFE, max: SAFE }), (amount) => {
        const sent = JSON.parse(JSON.stringify(moneyToWire(amount as Vnd))) as unknown;
        expect(moneySchema.parse(sent)).toBe(amount);
      }),
      { numRuns: 2_000 },
    );
  });
});
