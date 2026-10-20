import { SYNC_CLOCK_ERROR_CODES } from "@fnb/contracts";

/** Codes in sync results beside the domain's own; the till maps them to Vietnamese messages. */
export const SYNC_ERROR_CODES = {
  /** The till's clock runs more than two minutes ahead of the server's. */
  deviceClockAhead: SYNC_CLOCK_ERROR_CODES.deviceClockAhead,
  /** Not stored: an earlier command of this till is missing, resend from the gap. */
  outOfOrder: "SYNC_OUT_OF_ORDER",
  /** A device_seq already used by a different command of this till. Not stored. */
  deviceSeqReused: "SYNC_DEVICE_SEQ_REUSED",
  /** Another till already sent a command under this id; nothing of it is applied. */
  commandIdTaken: "SYNC_COMMAND_ID_TAKEN",
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
  /** The branch marked the product sold out, for this channel, before the till recorded it. */
  productSoldOut: "SYNC_PRODUCT_SOLD_OUT",
  /**
   * A line the kitchen has, or a void, a discount or a cancel line points at: a draft save
   * may not drop or change it (a sent line may only grow). Void it instead.
   */
  lineLocked: "SYNC_LINE_LOCKED",
  /** A setting of the branch or till (charge_profile…) holds a value the server cannot read. */
  settingInvalid: "SYNC_SETTING_INVALID",
  /** The staff member may not do this alone and the command names no approval. */
  approvalRequired: "SYNC_APPROVAL_REQUIRED",
  approvalNotFound: "SYNC_APPROVAL_NOT_FOUND",
  /** Approved for another staff member or on another till. */
  approvalNotForThisStaff: "SYNC_APPROVAL_NOT_FOR_THIS_STAFF",
  /** Approved for another action, or for another rate or amount of the same one. */
  approvalForAnotherAction: "SYNC_APPROVAL_FOR_ANOTHER_ACTION",
  approvalExpired: "SYNC_APPROVAL_EXPIRED",
  approvalAlreadyUsed: "SYNC_APPROVAL_ALREADY_USED",
  /** Nobody can lend this permission on the spot. */
  permissionDenied: "SYNC_PERMISSION_DENIED",
  /** Fewer ids than the discount has lines (one per tax rate on what it reduces). */
  discountLineIdsTooFew: "SYNC_DISCOUNT_LINE_IDS_TOO_FEW",
  /** A line to remove that is not a discount line of this order. */
  discountLineNotFound: "SYNC_DISCOUNT_LINE_NOT_FOUND",
  /**
   * The save would make the order discount a larger share of the bill than the staff
   * member may give alone (fewer goods under the same discount). Remove it and give it again.
   */
  discountRateRaised: "SYNC_DISCOUNT_RATE_RAISED",
  /** The kitchen has units of the order that were never voided; void them first. */
  orderHasSentItems: "SYNC_ORDER_HAS_SENT_ITEMS",
} as const;

/** Thrown by a command handler: the command is answered `rejected` with `code` and stored. */
export class CommandRejection extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "CommandRejection";
  }
}
