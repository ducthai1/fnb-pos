/** Codes the server returns in a rejection, and codes the client raises on a broken invariant. */
export const SYNC_ERROR_CODES = {
  orderNotFound: "DOMAIN_ORDER_NOT_FOUND",
  orderAlreadyPaid: "DOMAIN_ORDER_ALREADY_PAID",
  orderTotalMismatch: "DOMAIN_ORDER_TOTAL_MISMATCH",
  orderAlreadyExists: "DOMAIN_ORDER_ALREADY_EXISTS",
  unknownCommandType: "SYNC_UNKNOWN_COMMAND_TYPE",
  outOfOrder: "SYNC_OUT_OF_ORDER",
  deviceSeqReused: "SYNC_DEVICE_SEQ_REUSED",
  cursorWentBackwards: "SYNC_CURSOR_WENT_BACKWARDS",
  commandAlreadyQueued: "SYNC_COMMAND_ALREADY_QUEUED",
} as const;

export type SyncErrorCode = (typeof SYNC_ERROR_CODES)[keyof typeof SYNC_ERROR_CODES];
