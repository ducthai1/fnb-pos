import type { LocalClockParts } from "../time";
import type { PriceListItem, PriceListScope } from "./price-list-types";

/** Where and when an item is being sold, already resolved to the branch's wall clock. */
export interface PriceListContext {
  readonly productId: string;
  readonly categoryId: string | null;
  readonly variantId: string | null;
  readonly branchId: string;
  readonly channelKey: string | null;
  readonly at: number;
  readonly clock: LocalClockParts;
}

const SCOPE_RANK: Record<PriceListScope["kind"], number> = {
  variant: 3,
  product: 2,
  category: 1,
  global: 0,
};

/**
 * The single item that prices this sale, or null when none applies.
 * The most specific item wins: scope variant > product > category > global; then
 * an item for this branch over one for every branch; then one for this channel
 * over one for every channel; then higher priority; then the smaller id, so two
 * devices given the same list in any order always pick the same item.
 */
export function selectPriceListItem(
  priceList: readonly PriceListItem[],
  context: PriceListContext,
): PriceListItem | null {
  let winner: PriceListItem | null = null;
  for (const item of priceList) {
    if (!applies(item, context)) continue;
    if (winner === null || compareSpecificity(item, winner) < 0) winner = item;
  }
  return winner;
}

/** Negative when a should win over b. */
function compareSpecificity(a: PriceListItem, b: PriceListItem): number {
  return (
    SCOPE_RANK[b.scope.kind] - SCOPE_RANK[a.scope.kind] ||
    restricted(b.branchId) - restricted(a.branchId) ||
    restricted(b.channelKey) - restricted(a.channelKey) ||
    b.priority - a.priority ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

function restricted(filter: string | null): number {
  return filter === null ? 0 : 1;
}

function applies(item: PriceListItem, context: PriceListContext): boolean {
  return (
    scopeMatches(item.scope, context) &&
    (item.branchId === null || item.branchId === context.branchId) &&
    (item.channelKey === null || item.channelKey === context.channelKey) &&
    (item.validFrom === null || context.at >= item.validFrom) &&
    (item.validTo === null || context.at < item.validTo) &&
    scheduleMatches(item, context.clock)
  );
}

function scopeMatches(scope: PriceListScope, context: PriceListContext): boolean {
  switch (scope.kind) {
    case "variant":
      return context.variantId !== null && scope.variantId === context.variantId;
    case "product":
      return scope.productId === context.productId;
    case "category":
      return context.categoryId !== null && scope.categoryId === context.categoryId;
    case "global":
      return true;
  }
}

/**
 * A window that crosses midnight belongs to the day it starts on: "Friday
 * 22:00–02:00" is still on at 01:00 Saturday and is not on at 01:00 Friday,
 * which belongs to Thursday night's session.
 */
function scheduleMatches(item: PriceListItem, clock: LocalClockParts): boolean {
  const window = item.timeWindow;
  const minute = clock.minuteOfDay;
  if (window === null) return dayAllowed(item.daysOfWeek, clock.dayOfWeek);
  if (window.startMinute < window.endMinute) {
    return (
      minute >= window.startMinute &&
      minute < window.endMinute &&
      dayAllowed(item.daysOfWeek, clock.dayOfWeek)
    );
  }
  if (minute >= window.startMinute) return dayAllowed(item.daysOfWeek, clock.dayOfWeek);
  if (minute < window.endMinute) return dayAllowed(item.daysOfWeek, (clock.dayOfWeek + 6) % 7);
  return false;
}

function dayAllowed(days: readonly number[] | null, dayOfWeek: number): boolean {
  return days === null || days.includes(dayOfWeek);
}
