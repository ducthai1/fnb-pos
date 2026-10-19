import { describe, expect, it } from "vitest";
import type { PriceListItem } from "./price-list-types";
import {
  FRIDAY,
  MONDAY,
  SATURDAY,
  SUNDAY,
  percentOff,
  priceListItem,
  priceOf,
  vietnamTime,
} from "./pricing-test-helpers";

const minutes = (hour: number, minute = 0) => hour * 60 + minute;

/** The unit price of a size-M milk tea (35.000 đ) at a Vietnam wall-clock time. */
const priceAt = (item: PriceListItem, day: number, hour: number, minute = 0) =>
  priceOf({ priceList: [item], at: vietnamTime(day, hour, minute) }).unitPrice;

const HAPPY_HOUR = priceListItem({
  id: "happy-hour",
  effect: percentOff(20),
  daysOfWeek: [1, 2, 3, 4, 5],
  timeWindow: { startMinute: minutes(14), endMinute: minutes(17) },
});
const LATE_NIGHT = priceListItem({
  id: "late-night",
  effect: percentOff(20),
  timeWindow: { startMinute: minutes(22), endMinute: minutes(2) },
});

describe("price list schedule", () => {
  it("starts happy hour at 14:00 sharp on a weekday", () => {
    expect(priceAt(HAPPY_HOUR, MONDAY, 13, 59)).toBe(35_000n);
    expect(priceAt(HAPPY_HOUR, MONDAY, 14, 0)).toBe(28_000n);
  });

  it("ends happy hour at 17:00 sharp", () => {
    expect(priceAt(HAPPY_HOUR, FRIDAY, 16, 59)).toBe(28_000n);
    expect(priceAt(HAPPY_HOUR, FRIDAY, 17, 0)).toBe(35_000n);
  });

  it("keeps happy hour off at the weekend", () => {
    expect(priceAt(HAPPY_HOUR, SATURDAY, 15)).toBe(35_000n);
    expect(priceAt(HAPPY_HOUR, SUNDAY, 15)).toBe(35_000n);
  });

  it("reads the day of week on the branch's clock, not UTC", () => {
    // 06:30 Monday in Vietnam is still 23:30 Sunday in UTC.
    const mondayMorning = priceListItem({ id: "monday", effect: percentOff(20), daysOfWeek: [1] });
    expect(priceOf({ priceList: [mondayMorning], at: vietnamTime(MONDAY, 6, 30) }).unitPrice).toBe(
      28_000n,
    );
    const sameInstantInUtc = { at: vietnamTime(MONDAY, 6, 30), utcOffsetMinutes: 0 };
    expect(priceOf({ priceList: [mondayMorning], ...sameInstantInUtc }).unitPrice).toBe(35_000n);
  });

  it("runs a 22:00–02:00 window across midnight and stops at 02:00", () => {
    expect(priceAt(LATE_NIGHT, MONDAY, 21, 59)).toBe(35_000n);
    expect(priceAt(LATE_NIGHT, MONDAY, 22, 0)).toBe(28_000n);
    expect(priceAt(LATE_NIGHT, MONDAY, 23, 59)).toBe(28_000n);
    expect(priceAt(LATE_NIGHT, MONDAY + 1, 0, 0)).toBe(28_000n);
    expect(priceAt(LATE_NIGHT, MONDAY + 1, 1, 59)).toBe(28_000n);
    expect(priceAt(LATE_NIGHT, MONDAY + 1, 2, 0)).toBe(35_000n);
    expect(priceAt(LATE_NIGHT, MONDAY, 12)).toBe(35_000n);
  });

  it("counts the hours after midnight as the night the window started on", () => {
    const fridayNight = { ...LATE_NIGHT, daysOfWeek: [5] };
    expect(priceAt(fridayNight, FRIDAY, 23)).toBe(28_000n);
    expect(priceAt(fridayNight, SATURDAY, 1)).toBe(28_000n);
    // 01:00 Friday belongs to Thursday night; 23:00 Saturday is Saturday night.
    expect(priceAt(fridayNight, FRIDAY, 1)).toBe(35_000n);
    expect(priceAt(fridayNight, SATURDAY, 23)).toBe(35_000n);
  });

  it("applies from validFrom inclusive until validTo exclusive", () => {
    const from = vietnamTime(MONDAY, 0);
    const to = vietnamTime(MONDAY + 7, 0);
    const opening = priceListItem({
      id: "opening-week",
      effect: percentOff(20),
      validFrom: from,
      validTo: to,
    });
    const at = (instant: number) => priceOf({ priceList: [opening], at: instant }).unitPrice;
    expect(at(from - 1)).toBe(35_000n);
    expect(at(from)).toBe(28_000n);
    expect(at(to - 1)).toBe(28_000n);
    expect(at(to)).toBe(35_000n);
  });

  it("applies an open-ended validity from its start onwards", () => {
    const from = vietnamTime(MONDAY, 12);
    const newPrice = priceListItem({ id: "new-menu", effect: percentOff(20), validFrom: from });
    expect(priceOf({ priceList: [newPrice], at: from - 1 }).unitPrice).toBe(35_000n);
    expect(priceOf({ priceList: [newPrice], at: from + 365 * 86_400_000 }).unitPrice).toBe(28_000n);
  });

  it("applies a branch item only at that branch", () => {
    const q1Only = priceListItem({ id: "q1", effect: percentOff(20), branchId: "branch-q1" });
    expect(priceOf({ priceList: [q1Only] }).unitPrice).toBe(28_000n);
    expect(priceOf({ priceList: [q1Only], branchId: "branch-q3" }).unitPrice).toBe(35_000n);
  });

  it("applies a channel item only on that channel, and never to a sale without a channel", () => {
    const grab = priceListItem({ id: "grab", effect: percentOff(20), channelKey: "grab" });
    expect(priceOf({ priceList: [grab], channelKey: "grab" }).unitPrice).toBe(28_000n);
    expect(priceOf({ priceList: [grab], channelKey: "dine_in" }).unitPrice).toBe(35_000n);
    expect(priceOf({ priceList: [grab], channelKey: null }).unitPrice).toBe(35_000n);
    const everyChannel = priceListItem({ id: "all", effect: percentOff(20) });
    expect(priceOf({ priceList: [everyChannel], channelKey: null }).unitPrice).toBe(28_000n);
  });
});
