import type { FeatureFlagKey } from "./feature-flag-catalog";

/**
 * How far the till honours a switch, so the settings page never offers a switch that does
 * nothing:
 * - `works`: the till follows it.
 * - `locked_on`: the till always behaves as "on"; the switch cannot be turned off.
 * - `coming_soon`: the till does not follow it yet; the page shows it locked.
 * - `see_profile`: the switch means nothing; where the feature is really turned on or off
 *   is named on the page (the e-invoice profile).
 */
export type FlagTillSupport = "works" | "locked_on" | "coming_soon" | "see_profile";

export const FEATURE_FLAG_TILL_SUPPORT: Readonly<Record<FeatureFlagKey, FlagTillSupport>> = {
  tables: "works",
  pay_first_counter: "locked_on",
  cup_labels: "works",
  kitchen_routing: "works",
  course_firing: "coming_soon",
  qr_ordering: "coming_soon",
  happy_hour_pricing: "works",
  inventory_tracking: "coming_soon",
  auto_86_on_zero_stock: "coming_soon",
  allow_negative_stock: "coming_soon",
  einvoice: "see_profile",
  cash_rounding: "coming_soon",
};

/** What the till does for a switch, or "works" for a key that is not a catalog switch. */
export const tillSupportOf = (key: string): FlagTillSupport =>
  (FEATURE_FLAG_TILL_SUPPORT as Readonly<Record<string, FlagTillSupport>>)[key] ?? "works";

/** Whether a shop may not turn the switch off: the till behaves as "on" whatever is stored. */
export const isFlagLockedOn = (key: string): boolean => tillSupportOf(key) === "locked_on";
