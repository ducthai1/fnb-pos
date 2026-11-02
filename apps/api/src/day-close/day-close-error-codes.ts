/** Codes the day-close routes answer with. */
export const DAY_CLOSE_ERROR_CODES = {
  branchNotFound: "API_BRANCH_NOT_FOUND",
  /** The branch closed that day already; a close is never redone or undone. */
  alreadyClosed: "API_DAY_ALREADY_CLOSED",
  /** A cash shift of that day is still open: its takings are not counted yet. */
  shiftsOpen: "API_DAY_CLOSE_SHIFTS_OPEN",
  /** Tables of that day are still open: paid later, they would miss the day's figures. */
  draftsOpen: "API_DAY_CLOSE_DRAFTS_OPEN",
  /** Invoices of that day are still queued; the answer lists them. */
  invoicesUnissued: "API_DAY_CLOSE_INVOICES_UNISSUED",
  /** The day has not begun yet at the branch: closing it would close sales not yet made. */
  dayNotStarted: "API_DAY_CLOSE_DAY_NOT_STARTED",
} as const;

/** Codes of closing a revoked till's shift from the backoffice. */
export const SHIFT_ON_BEHALF_ERROR_CODES = {
  /** No shift of this tenant has that id. */
  shiftNotFound: "API_SHIFT_NOT_FOUND",
  /** Closed already, by its till or by another manager; a close is never redone. */
  alreadyClosed: "API_SHIFT_ALREADY_CLOSED",
  /** Its till is still paired: the cashier counts and closes it there. */
  deviceNotRevoked: "API_SHIFT_DEVICE_NOT_REVOKED",
  /** Cash reached the shift since the manager read it: the figure counted against is old. */
  versionConflict: "API_SHIFT_VERSION_CONFLICT",
} as const;
