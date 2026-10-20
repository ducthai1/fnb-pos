/**
 * Codes the print commands answer with; kept apart from the order, shift and kitchen codes
 * so the command families grow without touching one shared list.
 */
export const PRINT_SYNC_ERROR_CODES = {
  /** The slip names an order that is not one of the till's branch. */
  orderNotFound: "SYNC_PRINT_ORDER_NOT_FOUND",
  /** The shift report names a shift that is not one of the till's branch. */
  shiftNotFound: "SYNC_PRINT_SHIFT_NOT_FOUND",
} as const;
