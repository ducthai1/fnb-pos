import { describe, expect, it } from "vitest";
import { dayAfter, dayBefore, firstOfLastDays, shopDaysWindow, todaysBusinessDate } from "./business-day";

const at = (text: string) => Date.parse(text);
const inside = (window: { from: string; to: string }, instant: number) =>
  at(window.from) <= instant && instant < at(window.to);

describe("shopDaysWindow", () => {
  it("runs from 04:00 of the first business day to 04:00 after the last", () => {
    expect(shopDaysWindow("2026-10-20", "2026-10-21")).toEqual({
      from: "2026-10-19T21:00:00.000Z",
      to: "2026-10-21T21:00:00.000Z",
    });
  });

  it("keeps a slip that jammed after midnight in the day the pickers call today", () => {
    const halfPastMidnight = at("2026-10-21T00:30:00+07:00");
    const today = todaysBusinessDate(halfPastMidnight);
    expect(today).toBe("2026-10-20");
    expect(inside(shopDaysWindow(today, today)!, halfPastMidnight)).toBe(true);
  });

  it("gives 04:00 to the next business day, and 03:59 to the one before", () => {
    const day = shopDaysWindow("2026-10-20", "2026-10-20")!;
    expect(inside(day, at("2026-10-20T04:00:00+07:00"))).toBe(true);
    expect(inside(day, at("2026-10-20T03:59:59+07:00"))).toBe(false);
    expect(inside(day, at("2026-10-21T03:59:59+07:00"))).toBe(true);
    expect(inside(day, at("2026-10-21T04:00:00+07:00"))).toBe(false);
  });

  it.each([
    ["2026-10-21", "2026-10-20"],
    ["2026-02-30", "2026-03-01"],
    ["20/10/2026", "2026-10-21"],
  ])("refuses %s to %s", (fromDate, toDate) => {
    expect(shopDaysWindow(fromDate, toDate)).toBeNull();
  });
});

describe("dayBefore", () => {
  it("steps back over a month, a year and a leap day", () => {
    expect(dayBefore("2026-10-20")).toBe("2026-10-19");
    expect(dayBefore("2026-03-01")).toBe("2026-02-28");
    expect(dayBefore("2028-03-01")).toBe("2028-02-29");
    expect(dayBefore("2027-01-01")).toBe("2026-12-31");
  });

  it("leaves text that is not a day as it is", () => {
    expect(dayBefore("2026-02-30")).toBe("2026-02-30");
  });
});

describe("dayAfter", () => {
  it("steps forward over a month end, a leap day and a year", () => {
    expect(dayAfter("2026-10-20")).toBe("2026-10-21");
    expect(dayAfter("2028-02-28")).toBe("2028-02-29");
    expect(dayAfter("2026-12-31")).toBe("2027-01-01");
    expect(dayAfter(dayBefore("2026-03-01"))).toBe("2026-03-01");
  });

  it("leaves text that is not a day as it is", () => {
    expect(dayAfter("")).toBe("");
  });
});

describe("firstOfLastDays", () => {
  it("counts the last day in, across a month", () => {
    expect(firstOfLastDays("2026-10-20", 1)).toBe("2026-10-20");
    expect(firstOfLastDays("2026-10-20", 7)).toBe("2026-10-14");
    expect(firstOfLastDays("2026-03-02", 30)).toBe("2026-02-01");
  });
});
