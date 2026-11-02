import { DEVICE_UNAUTHENTICATED_CODE } from "@fnb/contracts";

export const DEVICE_ERROR_CODES = {
  /** Wrong, expired or already used code: deliberately indistinguishable. */
  pairingCodeInvalid: "API_DEVICE_PAIRING_CODE_INVALID",
  unauthenticated: DEVICE_UNAUTHENTICATED_CODE,
  deviceNotFound: "API_DEVICE_NOT_FOUND",
  branchNotFound: "API_BRANCH_NOT_FOUND",
  /** A flush grant asked for a till still paired, or a paired till sending under one. */
  deviceNotRevoked: "API_DEVICE_NOT_REVOKED",
  /** Wrong, expired, spent or another till's flush code: deliberately indistinguishable. */
  flushGrantInvalid: "API_DEVICE_FLUSH_GRANT_INVALID",
  /** A flushed command no staff member of the till can be named the author of. */
  flushNoAuthor: "API_DEVICE_FLUSH_NO_AUTHOR",
} as const;
