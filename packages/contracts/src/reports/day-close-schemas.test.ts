import { describe, expect, it } from "vitest";
import { outcomeOf } from "../zod-issue-test-helpers";
import { closeShiftOnBehalfBodySchema, dayCloseBodySchema, dayCloseQuerySchema } from "./day-close-schemas";

describe("dayCloseBodySchema", () => {
  it("names one business day", () => {
    expect(dayCloseBodySchema.parse({ businessDate: "2026-10-20" })).toEqual({
      businessDate: "2026-10-20",
    });
  });

  it.each([
    ["a day that does not exist", { businessDate: "2026-02-30" }],
    ["a moment instead of a day", { businessDate: "2026-10-20T00:00:00Z" }],
    ["a branch in the body, which the path names", { businessDate: "2026-10-20", branchId: "x" }],
    ["no day", {}],
  ])("refuses %s", (_case, body) => {
    expect(outcomeOf(dayCloseBodySchema, body).ok).toBe(false);
    expect(outcomeOf(dayCloseQuerySchema, body).ok).toBe(false);
  });
});

describe("closeShiftOnBehalfBodySchema", () => {
  it.each([0, 28_999, 1_234_567, Number.MAX_SAFE_INTEGER])("takes %d đồng counted", (countedCash) => {
    expect(closeShiftOnBehalfBodySchema.parse({ countedCash, version: 3 })).toEqual({ countedCash, version: 3 });
  });

  it.each([
    ["a negative count", { countedCash: -1, version: 1 }],
    ["part of a đồng", { countedCash: 0.5, version: 1 }],
    ["an amount past the safe range", { countedCash: 2 ** 53, version: 1 }],
    ["an amount as text", { countedCash: "29000", version: 1 }],
    ["no version", { countedCash: 0 }],
    ["a version that is not whole", { countedCash: 0, version: 1.5 }],
    ["notes, which a manager does not count here", { countedCash: 0, version: 1, denominations: [] }],
  ])("refuses %s", (_case, body) => {
    expect(outcomeOf(closeShiftOnBehalfBodySchema, body).ok).toBe(false);
  });
});
