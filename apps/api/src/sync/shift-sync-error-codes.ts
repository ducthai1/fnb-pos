/**
 * Codes the shift commands answer with beside the domain's; kept apart from the order
 * codes so the two command families grow without touching one shared list. Approvals are
 * judged for both families by one rule, so their codes are the shared ones.
 */
export const SHIFT_SYNC_ERROR_CODES = {
  /** No shift of this branch has that id, or it belongs to another branch. */
  shiftNotFound: "SYNC_SHIFT_NOT_FOUND",
  /** The shift id is already taken by another shift. */
  shiftIdTaken: "SYNC_SHIFT_ID_TAKEN",
  /** The till already has a shift that is not closed. */
  shiftAlreadyOpen: "SYNC_SHIFT_ALREADY_OPEN",
  /** A cash move or a close on a till with no open shift. */
  noOpenShift: "SYNC_NO_OPEN_SHIFT",
  /** A payment that names no shift from a till with none open: its money would be no one's. */
  paymentNeedsShift: "SYNC_PAYMENT_NEEDS_SHIFT",
  /** A refund that names no shift from a till with none open: its payout would be no one's. */
  refundNeedsShift: "SYNC_REFUND_NEEDS_SHIFT",
  cashMoveIdTaken: "SYNC_CASH_MOVE_ID_TAKEN",
} as const;
