/**
 * Why units were voided, a draft cancelled or a sale refunded, as the commands carry it: a
 * key, never free text, so reports group by it. The shop cannot edit these lists yet; each
 * ends with "other" so a reason nobody foresaw still has a place.
 */
export const VOID_REASONS = [
  "customer_changed_mind",
  "wrong_item",
  "made_wrong",
  "out_of_stock",
  "other",
] as const;

export const CANCEL_REASONS = ["customer_left", "duplicate_order", "test_order", "other"] as const;

export const REFUND_REASONS = [
  "customer_returned",
  "made_wrong",
  "quality_issue",
  "overcharged",
  "other",
] as const;

export type ReasonCode =
  (typeof VOID_REASONS)[number] | (typeof CANCEL_REASONS)[number] | (typeof REFUND_REASONS)[number];
