export const STAFF_ERROR_CODES = {
  pinFormat: "API_STAFF_PIN_FORMAT",
  pinTooWeak: "API_STAFF_PIN_TOO_WEAK",
  roleNotFound: "API_ROLE_NOT_FOUND",
  branchNotFound: "API_BRANCH_NOT_FOUND",
  staffNotFound: "API_STAFF_NOT_FOUND",
  notInBranch: "API_STAFF_NOT_IN_BRANCH",
  pinInvalid: "API_STAFF_PIN_INVALID",
  pinLocked: "API_STAFF_PIN_LOCKED",
  sessionInvalid: "API_STAFF_SESSION_INVALID",
  /** Locking someone already locked, or letting back someone who was never locked. */
  alreadyInactive: "API_STAFF_ALREADY_INACTIVE",
  alreadyActive: "API_STAFF_ALREADY_ACTIVE",
  /** No wrong PIN is counted against them: there is nothing to clear. */
  pinNotLocked: "API_STAFF_PIN_NOT_LOCKED",
  roleArchived: "API_ROLE_ARCHIVED",
} as const;
