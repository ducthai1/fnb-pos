export const SHIFT_ERROR_CODES = {
  invalidTransition: "DOMAIN_SHIFT_INVALID_TRANSITION",
  /** A note or coin the State Bank does not issue in the series the counter takes. */
  unknownDenomination: "DOMAIN_SHIFT_UNKNOWN_DENOMINATION",
  duplicateDenomination: "DOMAIN_SHIFT_DUPLICATE_DENOMINATION",
  invalidPieces: "DOMAIN_SHIFT_INVALID_PIECES",
  /** The amount stated for a count is not what its notes add up to. */
  countMismatch: "DOMAIN_SHIFT_COUNT_MISMATCH",
  /** Every amount in a shift's cash book is a magnitude; its kind says which way it went. */
  negativeAmount: "DOMAIN_SHIFT_NEGATIVE_AMOUNT",
  /** Cash moves in and out of the drawer only while the shift is open. */
  notOpen: "DOMAIN_SHIFT_NOT_OPEN",
} as const;
