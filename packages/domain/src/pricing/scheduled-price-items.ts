import type { PriceListItem } from "./price-list-types";

/**
 * Whether the item applies only at certain times: between two dates, on certain weekdays or
 * in a window of the day (a happy hour). An item with none of these is the price of a branch
 * or a channel all day, every day.
 */
export const isScheduledPriceItem = (item: PriceListItem): boolean =>
  item.validFrom !== null ||
  item.validTo !== null ||
  item.daysOfWeek !== null ||
  item.timeWindow !== null;

/**
 * The price list as a shop that turned scheduled prices off sells from it: items that apply
 * at all times stay (a branch's own price, a delivery channel's), the timed ones are ignored
 * so every product sells at its base or permanent price.
 */
export const withoutScheduledPrices = (items: readonly PriceListItem[]): PriceListItem[] =>
  items.filter((item) => !isScheduledPriceItem(item));
