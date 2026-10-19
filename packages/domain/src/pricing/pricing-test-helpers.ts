import { PEARL_MILK_TEA } from "../catalog/pearl-milk-tea-test-fixture";
import { type RoundingMode, percentRate, vnd } from "../money";
import type { PriceListEffect, PriceListItem } from "./price-list-types";
import {
  type ResolveUnitPriceInput,
  type ResolvedUnitPrice,
  resolveUnitPrice,
} from "./resolve-price";

/* Test-only helpers for the pricing tests; not exported from the package. */

export const VIETNAM = 7 * 60;

/** Epoch ms of a wall-clock time in Vietnam in October 2026; the 19th is a Monday. */
export function vietnamTime(day: number, hour: number, minute = 0): number {
  return Date.UTC(2026, 9, day, hour, minute) - VIETNAM * 60_000;
}

export const MONDAY = 19;
export const FRIDAY = 23;
export const SATURDAY = 24;
export const SUNDAY = 25;

export const percentOff = (
  percent: number,
  rounding: RoundingMode = "half-up",
): PriceListEffect => ({
  kind: "percent_off",
  rate: percentRate(percent),
  rounding,
});

export const fixedPrice = (price: number): PriceListEffect => ({
  kind: "fixed_price",
  price: vnd(price),
});

/** An item that applies everywhere, always, unless the overrides narrow it. */
export function priceListItem(
  overrides: Partial<PriceListItem> & Pick<PriceListItem, "id">,
): PriceListItem {
  return {
    scope: { kind: "global" },
    branchId: null,
    channelKey: null,
    validFrom: null,
    validTo: null,
    daysOfWeek: null,
    timeWindow: null,
    effect: percentOff(10),
    priority: 0,
    ...overrides,
  };
}

/** A size-M pearl milk tea (35.000 đ) sold to dine-in guests at branch Q1, Monday 10:00. */
export function priceOf(overrides: Partial<ResolveUnitPriceInput> = {}): ResolvedUnitPrice {
  return resolveUnitPrice({
    product: PEARL_MILK_TEA,
    variantId: "size-m",
    branchId: "branch-q1",
    channelKey: "dine_in",
    at: vietnamTime(MONDAY, 10),
    utcOffsetMinutes: VIETNAM,
    priceList: [],
    ...overrides,
  });
}
