import type { BasisPoints, RoundingMode, Vnd } from "../money";

/** What a price list item applies to, from the narrowest to the broadest. */
export type PriceListScope =
  | { readonly kind: "variant"; readonly variantId: string }
  | { readonly kind: "product"; readonly productId: string }
  | { readonly kind: "category"; readonly categoryId: string }
  | { readonly kind: "global" };

/**
 * Minutes of the branch's local day; endMinute is excluded, so 14:00–17:00 is
 * { 840, 1020 } and stops at 17:00 sharp. startMinute > endMinute crosses midnight
 * (22:00–02:00 is { 1320, 120 }); endMinute may be 1440 to run until midnight.
 */
export interface LocalTimeWindow {
  readonly startMinute: number;
  readonly endMinute: number;
}

export type PriceListEffect =
  | { readonly kind: "fixed_price"; readonly price: Vnd }
  /** Off the catalog price; `rounding` turns the discounted price into whole đồng. */
  | { readonly kind: "percent_off"; readonly rate: BasisPoints; readonly rounding: RoundingMode };

/**
 * A price rule for some products at some branches, channels and times, e.g. "Grab
 * price for milk tea" or "happy hour 20% off drinks, Mon–Fri 14:00–17:00".
 * Null filters mean "no restriction".
 */
export interface PriceListItem {
  readonly id: string;
  readonly scope: PriceListScope;
  readonly branchId: string | null;
  readonly channelKey: string | null;
  /** Epoch ms, inclusive. */
  readonly validFrom: number | null;
  /** Epoch ms, excluded. */
  readonly validTo: number | null;
  /** 0 = Sunday … 6 = Saturday, in the branch's local time. */
  readonly daysOfWeek: readonly number[] | null;
  readonly timeWindow: LocalTimeWindow | null;
  readonly effect: PriceListEffect;
  /** Breaks ties between equally specific items; higher wins. */
  readonly priority: number;
}
