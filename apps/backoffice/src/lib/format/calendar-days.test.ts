import { describe, expect, it } from "vitest";
import {
  dayMonthYear,
  monthTitle,
  monthWeeks,
  mondayFirstWeekday,
  parseDayMonthYear,
  shiftDays,
  shiftMonths,
} from "./calendar-days";

describe("reading a day typed day first", () => {
  it.each([
    ["30/10/2026", "2026-10-30"],
    ["3/1/2026", "2026-01-03"],
    ["03-01-2026", "2026-01-03"],
    [" 03 . 01 . 2026 ", "2026-01-03"],
    ["29/02/2028", "2028-02-29"],
  ])("takes %s as %s", (text, day) => expect(parseDayMonthYear(text)).toBe(day));

  it.each([
    "",
    "10/30/2026",
    "31/04/2026",
    "29/02/2027",
    "1/1/26",
    "ab/cd/efgh",
    "30/10",
    "2026-10-30",
    "30/10/2026x",
  ])("does not take %j", (text) => expect(parseDayMonthYear(text)).toBeNull());

  it("writes a day day first whatever the language of the browser", () => {
    expect(dayMonthYear("2026-10-30")).toBe("30/10/2026");
    expect(dayMonthYear("2026-1-30")).toBe("");
    expect(dayMonthYear("")).toBe("");
  });
});

describe("walking days and months", () => {
  it("crosses month and year ends", () => {
    expect(shiftDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("keeps the day number, or the month's last day when it has none", () => {
    expect(shiftMonths("2026-10-15", 1)).toBe("2026-11-15");
    expect(shiftMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(shiftMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(shiftMonths("2026-12-10", 1)).toBe("2027-01-10");
    expect(shiftMonths("2026-01-10", -1)).toBe("2025-12-10");
  });

  it("reads weeks from Monday", () => {
    expect(mondayFirstWeekday("2026-10-26")).toBe(0);
    expect(mondayFirstWeekday("2026-11-01")).toBe(6);
  });
});

describe("the weeks that show a month", () => {
  it("starts on the Monday on or before the 1st and holds every day of the month", () => {
    const weeks = monthWeeks("2026-10-30");
    expect(weeks[0]?.[0]).toBe("2026-09-28");
    expect(weeks.flat()).toContain("2026-10-31");
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks).toHaveLength(5);
  });

  it("is four weeks for a February that starts on a Monday", () => {
    expect(monthWeeks("2027-02-10")).toHaveLength(4);
  });

  it("names the month", () => expect(monthTitle("2026-10-30")).toBe("Tháng 10 năm 2026"));
});
