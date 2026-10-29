import { describe, expect, it } from "vitest";
import { clockText, endOfDayText, lastDayText, localDateText, parseClockText, startOfDayText } from "./clock-and-date-text";

describe("clock text", () => {
  it.each([
    ["14:00", false, 840],
    ["9:05", false, 545],
    ["00:00", false, 0],
    ["24:00", true, 1440],
  ])("reads %s", (text, end, minute) => expect(parseClockText(text, end)).toBe(minute));

  it.each([["24:00", false], ["25:00", true], ["12:60", false], ["1400", false], ["", false], ["14h", false], ["-1:00", false]])(
    "refuses %j",
    (text, end) => expect(parseClockText(text, end)).toBeNull(),
  );

  it("writes minutes the way it reads them", () => {
    expect([0, 545, 840, 1439, 1440].map(clockText)).toEqual(["00:00", "09:05", "14:00", "23:59", "24:00"]);
  });
});

describe("date text", () => {
  it("starts a typed day at midnight shop time, whatever the browser's zone", () => {
    expect(new Date(startOfDayText("01/11/2026") ?? Number.NaN).toISOString()).toBe("2026-10-31T17:00:00.000Z");
  });

  it("holds a rule through its last typed day", () => {
    expect(new Date(endOfDayText("07/11/2026") ?? Number.NaN).toISOString()).toBe("2026-11-07T17:00:00.000Z");
    expect(lastDayText(Date.parse("2026-11-07T17:00:00.000Z"))).toBe("07/11/2026");
    expect(localDateText(Date.parse("2026-10-31T17:00:00.000Z"))).toBe("01/11/2026");
  });

  it.each(["31/02/2026", "1/13/2026", "2026-11-01", "", "01/11/26", "aa/bb/cccc"])("refuses %j", (text) => {
    expect(startOfDayText(text)).toBeNull();
  });
});
