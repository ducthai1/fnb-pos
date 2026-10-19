export const PRICING_ERROR_CODES = {
  // Product configuration
  missingBasePrice: "DOMAIN_PRICING_MISSING_BASE_PRICE",
  // Cashier-entered price
  enteredPriceRequired: "DOMAIN_PRICING_ENTERED_PRICE_REQUIRED",
  enteredPriceNotAllowed: "DOMAIN_PRICING_ENTERED_PRICE_NOT_ALLOWED",
  negativeEnteredPrice: "DOMAIN_PRICING_NEGATIVE_ENTERED_PRICE",
  // Price list configuration
  fixedPriceOnBroadScope: "DOMAIN_PRICING_FIXED_PRICE_ON_BROAD_SCOPE",
  negativeFixedPrice: "DOMAIN_PRICING_NEGATIVE_FIXED_PRICE",
  invalidValidityRange: "DOMAIN_PRICING_INVALID_VALIDITY_RANGE",
  invalidDaysOfWeek: "DOMAIN_PRICING_INVALID_DAYS_OF_WEEK",
  invalidTimeWindow: "DOMAIN_PRICING_INVALID_TIME_WINDOW",
  invalidPriority: "DOMAIN_PRICING_INVALID_PRIORITY",
} as const;
