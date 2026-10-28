export const PRICING_ERROR_CODES = {
  // Product configuration
  missingBasePrice: "DOMAIN_PRICING_MISSING_BASE_PRICE",
  measureUnitMissing: "DOMAIN_PRICING_MEASURE_UNIT_MISSING",
  measureUnitOnUnweighedProduct: "DOMAIN_PRICING_MEASURE_UNIT_ON_UNWEIGHED_PRODUCT",
  // Cashier-entered price
  enteredPriceRequired: "DOMAIN_PRICING_ENTERED_PRICE_REQUIRED",
  enteredPriceNotAllowed: "DOMAIN_PRICING_ENTERED_PRICE_NOT_ALLOWED",
  negativeEnteredPrice: "DOMAIN_PRICING_NEGATIVE_ENTERED_PRICE",
  enteredPriceTooLarge: "DOMAIN_PRICING_ENTERED_PRICE_TOO_LARGE",
  // Weight of a line sold by weight
  weightNotPositive: "DOMAIN_PRICING_WEIGHT_NOT_POSITIVE",
  weightNotWholeGrams: "DOMAIN_PRICING_WEIGHT_NOT_WHOLE_GRAMS",
  weightTooLarge: "DOMAIN_PRICING_WEIGHT_TOO_LARGE",
  // Price list configuration
  fixedPriceOnBroadScope: "DOMAIN_PRICING_FIXED_PRICE_ON_BROAD_SCOPE",
  negativeFixedPrice: "DOMAIN_PRICING_NEGATIVE_FIXED_PRICE",
  invalidValidityRange: "DOMAIN_PRICING_INVALID_VALIDITY_RANGE",
  invalidDaysOfWeek: "DOMAIN_PRICING_INVALID_DAYS_OF_WEEK",
  invalidTimeWindow: "DOMAIN_PRICING_INVALID_TIME_WINDOW",
  invalidPriority: "DOMAIN_PRICING_INVALID_PRIORITY",
  duplicatePriceListItemId: "DOMAIN_PRICING_DUPLICATE_PRICE_LIST_ITEM_ID",
  // A product's own price list items
  scopeVariantNotOnProduct: "DOMAIN_PRICING_SCOPE_VARIANT_NOT_ON_PRODUCT",
  scopeProductMismatch: "DOMAIN_PRICING_SCOPE_PRODUCT_MISMATCH",
} as const;
