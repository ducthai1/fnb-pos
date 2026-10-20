/**
 * Codes of sync results about the version a till edited an order from; the till maps them
 * to Vietnamese messages.
 */
export const SYNC_ORDER_VERSION_ERROR_CODES = {
  /**
   * order.save_draft named an expectedVersion the order is no longer at: another till
   * changed it meanwhile. Nothing was saved; the result carries the order as it is now,
   * for the till to redo its change on.
   */
  orderVersionStale: "SYNC_ORDER_VERSION_STALE",
} as const;
