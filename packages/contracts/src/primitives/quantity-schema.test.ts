import { MONEY_ERROR_CODES, type Quantity, quantityFromThousandths } from "@fnb/domain";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { domainCodesOf, outcomeOf } from "../zod-issue-test-helpers";
import { quantitySchema, quantityToWire } from "./quantity-schema";

describe("quantitySchema", () => {
  it.each([
    ["1", 1000n],
    ["1.5", 1500n],
    ["0.125", 125n],
    ["-2", -2000n],
    ["250.000", 250_000n],
  ])("reads %j as %d thousandths", (wire, thousandths) => {
    expect(quantitySchema.parse(wire)).toBe(thousandths);
  });

  it("refuses a fourth decimal with the domain's code instead of rounding it", () => {
    expect(domainCodesOf(quantitySchema, "1.2345")).toEqual([MONEY_ERROR_CODES.quantityTooPrecise]);
  });

  it.each(["", "abc", "1,5", "1.", ".5", "1e3", "--1"])(
    "refuses the malformed decimal %j with the domain's code",
    (wire) => {
      expect(domainCodesOf(quantitySchema, wire)).toEqual([MONEY_ERROR_CODES.invalidQuantity]);
    },
  );

  it("refuses a JSON number, which may already carry float noise", () => {
    expect(outcomeOf(quantitySchema, 1.5)).toEqual({
      ok: false,
      issues: [expect.objectContaining({ code: "invalid_type" })],
    });
  });

  it("refuses padding the domain would have trimmed away", () => {
    expect(outcomeOf(quantitySchema, " 1.5").ok).toBe(false);
    expect(outcomeOf(quantitySchema, "1.5\n").ok).toBe(false);
    expect(domainCodesOf(quantitySchema, " 1.5")).toEqual([]);
  });

  it("refuses a string far longer than any stored quantity", () => {
    expect(outcomeOf(quantitySchema, "9".repeat(33)).ok).toBe(false);
    expect(outcomeOf(quantitySchema, "9".repeat(32)).ok).toBe(true);
  });
});

describe("quantityToWire", () => {
  it.each([
    [1500n, "1.5"],
    [2000n, "2"],
    [125n, "0.125"],
    [-500n, "-0.5"],
    [0n, "0"],
  ])("writes %d thousandths as %j", (thousandths, wire) => {
    expect(quantityToWire(quantityFromThousandths(thousandths))).toBe(wire);
  });

  const thousandths = fc.bigInt({ min: -(10n ** 15n), max: 10n ** 15n });

  it("round-trips every quantity through JSON exactly", () => {
    fc.assert(
      fc.property(thousandths, (value) => {
        const sent = JSON.parse(JSON.stringify(quantityToWire(value as Quantity))) as unknown;
        expect(quantitySchema.parse(sent)).toBe(value);
      }),
      { numRuns: 2_000 },
    );
  });

  it("writes one canonical spelling, whatever spelling was read", () => {
    const decimals = fc
      .tuple(fc.bigInt({ min: 0n, max: 10n ** 9n }), fc.integer({ min: 0, max: 3 }), fc.boolean())
      .chain(([whole, places, negative]) =>
        fc
          .integer({ min: 0, max: 10 ** places - 1 })
          .map((digits) => String(digits).padStart(places, "0"))
          .map((fraction) => `${negative ? "-" : ""}${whole}${places > 0 ? `.${fraction}` : ""}`),
      );
    fc.assert(
      fc.property(decimals, (wire) => {
        const read = quantitySchema.parse(wire);
        const canonical = quantityToWire(read);
        expect(quantitySchema.parse(canonical)).toBe(read);
        expect(quantityToWire(quantitySchema.parse(canonical))).toBe(canonical);
      }),
      { numRuns: 2_000 },
    );
  });
});
