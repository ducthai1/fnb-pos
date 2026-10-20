export const PAYMENT_ERROR_CODES = {
  /** A bank BIN is the six-digit NAPAS code of the receiving bank. */
  invalidBankBin: "DOMAIN_PAYMENT_INVALID_BANK_BIN",
  invalidAccountNumber: "DOMAIN_PAYMENT_INVALID_ACCOUNT_NUMBER",
  /** A QR for a sale asks for a whole, positive amount the payload field can hold. */
  invalidAmount: "DOMAIN_PAYMENT_INVALID_AMOUNT",
  /** Transfer content outside the characters every bank app keeps as typed. */
  contentInvalidCharacters: "DOMAIN_PAYMENT_CONTENT_INVALID_CHARACTERS",
  contentTooLong: "DOMAIN_PAYMENT_CONTENT_TOO_LONG",
  invalidMerchantName: "DOMAIN_PAYMENT_INVALID_MERCHANT_NAME",
  /** A payload whose fields cannot be read as EMVCo tag-length-value. */
  malformedPayload: "DOMAIN_PAYMENT_MALFORMED_PAYLOAD",
  /** The payload's checksum is not the one its content gives: it was cut or altered. */
  checksumMismatch: "DOMAIN_PAYMENT_CHECKSUM_MISMATCH",
  /** A well-formed EMVCo payload that is not a VietQR bank-account transfer in đồng. */
  notAVietQrTransfer: "DOMAIN_PAYMENT_NOT_A_VIETQR_TRANSFER",
  /** Not enough random bytes to draw a transfer code from. */
  notEnoughRandomness: "DOMAIN_PAYMENT_NOT_ENOUGH_RANDOMNESS",
  invalidIntentTransition: "DOMAIN_PAYMENT_INVALID_INTENT_TRANSITION",
} as const;
