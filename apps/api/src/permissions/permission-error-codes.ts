import { PERMISSIONS_ERROR_CODES, isDomainError } from "@fnb/domain";

export const PERMISSION_ERROR_CODES = {
  /** The caller's role lacks the key. The backoffice has no on-the-spot approval. */
  denied: "API_PERMISSION_DENIED",
  unknownKey: "API_PERMISSION_UNKNOWN_KEY",
  /** A threshold of the wrong kind or type for its key, or for a key not granted. */
  invalidThreshold: "API_PERMISSION_INVALID_THRESHOLD",
  /** An action without the rate or amount its key is judged by, or with one out of range. */
  invalidAction: "API_PERMISSION_INVALID_ACTION",
} as const;

export const APPROVAL_ERROR_CODES = {
  /** The key is never lent (administration, reports): its holder acts in person. */
  notApprovable: "API_APPROVAL_NOT_APPROVABLE",
  /** Someone needing approval cannot be their own approver. */
  selfApproval: "API_APPROVAL_SELF_APPROVAL",
  /** The approver may not do the action alone either, threshold included. */
  approverNotPermitted: "API_APPROVAL_APPROVER_NOT_PERMITTED",
} as const;

const FROM_DOMAIN: Readonly<Record<string, string>> = {
  [PERMISSIONS_ERROR_CODES.unknownKey]: PERMISSION_ERROR_CODES.unknownKey,
  [PERMISSIONS_ERROR_CODES.invalidGrant]: PERMISSION_ERROR_CODES.invalidThreshold,
  [PERMISSIONS_ERROR_CODES.invalidActionValue]: PERMISSION_ERROR_CODES.invalidAction,
};

/**
 * The 400 code for a permission rule the client's input broke, or null for any other
 * error. Only input a client sent may be mapped: the same domain error raised by a stored
 * role is corrupt data and must stay a 500.
 */
export function clientPermissionErrorCode(error: unknown): string | null {
  if (!isDomainError(error)) return null;
  return FROM_DOMAIN[error.code] ?? null;
}
