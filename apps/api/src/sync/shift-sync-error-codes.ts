/**
 * Codes the shift commands answer with beside the domain's; kept apart from the order
 * codes so the two command families grow without touching one shared list.
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
  cashMoveIdTaken: "SYNC_CASH_MOVE_ID_TAKEN",
  /** The staff member may not do this alone and sent no approval. */
  approvalRequired: "SYNC_APPROVAL_REQUIRED",
  /** The approval is for another action, another person, another till, or too little. */
  approvalInvalid: "SYNC_APPROVAL_INVALID",
  approvalAlreadyUsed: "SYNC_APPROVAL_ALREADY_USED",
  /** The key is never lent and the staff member does not hold it. */
  permissionDenied: "SYNC_PERMISSION_DENIED",
} as const;
