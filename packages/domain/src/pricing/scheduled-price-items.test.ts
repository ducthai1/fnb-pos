import { describe, expect, it } from "vitest";
import {
  MONDAY,
  percentOff,
  priceListItem,
  priceOf,
  vietnamTime,
} from "./pricing-test-helpers";
import { isScheduledPriceItem, withoutScheduledPrices } from "./scheduled-price-items";

const ALL_DAY = priceListItem({ id: "branch-price", effect: percentOff(10) });
const HAPPY_HOUR = priceListItem({
  id: "happy-hour",
  effect: percentOff(20),
  timeWindow: { startMinute: 14 * 60, endMinute: 17 * 60 },
});
const WEEKENDS = priceListItem({ id: "weekends", effect: percentOff(20), daysOfWeek: [0, 6] });
const SEASON = priceListItem({ id: "season", effect: percentOff(20), validFrom: 1, validTo: 2 });

describe("prices that apply only at certain times", () => {
  it.each([
    [HAPPY_HOUR, true],
    [WEEKENDS, true],
    [SEASON, true],
    [ALL_DAY, false],
  ])("knows %o is scheduled: %s", (item, scheduled) => {
    expect(isScheduledPriceItem(item)).toBe(scheduled);
  });

  it("keeps the all-day price and drops the timed ones", () => {
    expect(
      withoutScheduledPrices([ALL_DAY, HAPPY_HOUR, WEEKENDS, SEASON]).map((item) => item.id),
    ).toEqual(["branch-price"]);
  });

  it("sells at the base price in happy hour once the timed prices are dropped", () => {
    const at = vietnamTime(MONDAY, 15);
    const items = [HAPPY_HOUR];
    expect(priceOf({ priceList: items, at }).unitPrice).toBe(28_000n);
    expect(priceOf({ priceList: withoutScheduledPrices(items), at }).unitPrice).toBe(35_000n);
  });
});
