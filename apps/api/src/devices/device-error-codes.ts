export const DEVICE_ERROR_CODES = {
  /** Wrong, expired or already used code: deliberately indistinguishable. */
  pairingCodeInvalid: "API_DEVICE_PAIRING_CODE_INVALID",
  unauthenticated: "API_DEVICE_UNAUTHENTICATED",
  deviceNotFound: "API_DEVICE_NOT_FOUND",
  branchNotFound: "API_BRANCH_NOT_FOUND",
} as const;
