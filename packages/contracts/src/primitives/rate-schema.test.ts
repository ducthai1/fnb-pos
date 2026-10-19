import { MONEY_ERROR_CODES } from "@fnb/domain";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { domainCodesOf, outcomeOf } from "../zod-issue-test-helpers";
import { rateSchema } from "./rate-schema";

describe("rateSchema", () => {
  it.each([0, 800, 1_000, 10_000])("reads %d basis points as is", (wire) => {
    expect(rateSchema.parse(wire)).toBe(wire);
  });

  it.each([10_001, -1, 8.5])("refuses %d with the domain's rate code", (wire) => {
    expect(domainCodesOf(rateSchema, wire)).toEqual([MONEY_ERROR_CODES.invalidRate]);
  });

  it("refuses a percentage sent as a string", () => {
    expect(outcomeOf(rateSchema, "8%").ok).toBe(false);
    expect(domainCodesOf(rateSchema, "800")).toEqual([]);
  });

  it("round-trips every rate the domain accepts through JSON", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000 }), (rate) => {
        expect(rateSchema.parse(JSON.parse(JSON.stringify(rate)))).toBe(rate);
      }),
    );
  });
});
