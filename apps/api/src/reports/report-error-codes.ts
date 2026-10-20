/** Codes the backoffice reports answer with. */
export const REPORT_ERROR_CODES = {
  /** A branch the member's organization does not have, told apart from nothing to report. */
  branchNotFound: "API_BRANCH_NOT_FOUND",
  /** `from` is not before `to`: an empty window would read as "nothing failed". */
  invalidRange: "API_REPORT_INVALID_RANGE",
} as const;
