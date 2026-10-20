import { describe, expect, it } from "vitest";
import { outcomeOf } from "../zod-issue-test-helpers";
import { dayCloseBodySchema, dayCloseQuerySchema } from "./day-close-schemas";

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
