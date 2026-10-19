import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { outcomeOf } from "../zod-issue-test-helpers";
import { businessDateSchema } from "./business-date-schema";

const refused = (wire: unknown) => outcomeOf(businessDateSchema, wire).ok === false;

describe("businessDateSchema", () => {
  it.each(["2026-10-20", "2028-02-29", "2000-02-29", "2026-12-31", "2026-01-01"])(
    "accepts the day %s",
    (wire) => {
      expect(businessDateSchema.parse(wire)).toBe(wire);
    },
  );

  it.each([
    ["the 29th of February in a common year", "2026-02-29"],
    ["the 29th of February in a century year", "2100-02-29"],
    ["a 31st in a 30-day month", "2026-04-31"],
    ["month 13", "2026-13-01"],
    ["month 0", "2026-00-10"],
    ["day 0", "2026-10-00"],
    ["year 0", "0000-01-01"],
    ["single-digit month", "2026-1-01"],
    ["a time part", "2026-10-20T00:00:00Z"],
    ["slashes", "2026/10/20"],
    ["a trailing newline", "2026-10-20\n"],
  ])("refuses %s", (_label, wire) => {
    expect(refused(wire)).toBe(true);
  });

  it("refuses a date that is not a string", () => {
    expect(refused(20261020)).toBe(true);
  });

  it("accepts every real calendar day and refuses the days after a month's last", () => {
    const days = fc.date({
      min: new Date("0001-01-01T00:00:00Z"),
      max: new Date("9999-12-31T00:00:00Z"),
      noInvalidDate: true,
    });
    fc.assert(
      fc.property(days, (day) => {
        const wire = day.toISOString().slice(0, 10);
        expect(businessDateSchema.parse(wire)).toBe(wire);
        // Day 0 of the next month is this month's last; set on a copy at day 1 so it never
        // overflows, and without Date.UTC, which reads years below 100 as 19xx.
        const probe = new Date(day.getTime());
        probe.setUTCDate(1);
        probe.setUTCMonth(probe.getUTCMonth() + 1, 0);
        const lastDay = probe.getUTCDate();
        expect(refused(`${wire.slice(0, 8)}${String(lastDay + 1).padStart(2, "0")}`)).toBe(true);
      }),
      { numRuns: 2_000 },
    );
  });
});
