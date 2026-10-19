/** Codes in sync results beside the domain's own; the till maps them to Vietnamese messages. */
export const SYNC_ERROR_CODES = {
  /** Not stored: an earlier command of this till is missing, resend from the gap. */
  outOfOrder: "SYNC_OUT_OF_ORDER",
  /** A device_seq already used by a different command of this till. Not stored. */
  deviceSeqReused: "SYNC_DEVICE_SEQ_REUSED",
  domainVersionUnsupported: "SYNC_DOMAIN_VERSION_UNSUPPORTED",
  unknownCommandType: "SYNC_UNKNOWN_COMMAND_TYPE",
  invalidPayload: "SYNC_INVALID_PAYLOAD",
  orderNotFound: "SYNC_ORDER_NOT_FOUND",
  /** The order id is taken by an order this till may not edit (another branch). */
  orderIdTaken: "SYNC_ORDER_ID_TAKEN",
  /** Another order of this till already carries that device order number. */
  deviceOrderNoTaken: "SYNC_DEVICE_ORDER_NO_TAKEN",
  /** A line id that belongs to another order. */
  lineIdTaken: "SYNC_LINE_ID_TAKEN",
  productNotFound: "SYNC_PRODUCT_NOT_FOUND",
  comboNotSupported: "SYNC_COMBO_NOT_SUPPORTED",
  /** What the customer was asked to pay is not what the order now comes to. */
  orderTotalMismatch: "DOMAIN_ORDER_TOTAL_MISMATCH",
  paymentsDoNotMatchAmountDue: "SYNC_PAYMENTS_DO_NOT_MATCH_AMOUNT_DUE",
} as const;

/** Thrown by a command handler: the command is answered `rejected` with `code` and stored. */
export class CommandRejection extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "CommandRejection";
  }
}
