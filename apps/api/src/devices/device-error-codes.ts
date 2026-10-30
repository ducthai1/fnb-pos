import { DEVICE_UNAUTHENTICATED_CODE } from "@fnb/contracts";

export const DEVICE_ERROR_CODES = {
  /** Wrong, expired or already used code: deliberately indistinguishable. */
  pairingCodeInvalid: "API_DEVICE_PAIRING_CODE_INVALID",
  unauthenticated: DEVICE_UNAUTHENTICATED_CODE,
  deviceNotFound: "API_DEVICE_NOT_FOUND",
  branchNotFound: "API_BRANCH_NOT_FOUND",
} as const;
