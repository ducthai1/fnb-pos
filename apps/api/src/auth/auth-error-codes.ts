/** Stable codes in error bodies; the UI maps them to Vietnamese messages. */
export const AUTH_ERROR_CODES = {
  invalidRequest: "API_INVALID_REQUEST",
  internal: "API_INTERNAL",
  /** Wrong password, unknown account or locked account: deliberately indistinguishable. */
  invalidCredentials: "API_AUTH_INVALID_CREDENTIALS",
  noActiveMembership: "API_AUTH_NO_ACTIVE_MEMBERSHIP",
  organizationRequired: "API_AUTH_ORGANIZATION_REQUIRED",
  notAMember: "API_AUTH_NOT_A_MEMBER",
  unauthenticated: "API_AUTH_UNAUTHENTICATED",
} as const;
