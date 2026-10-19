import type { SyncErrorCode } from "./sync-error-codes";

/** Same shape as the domain's DomainError, for invariants that belong to the sync layer. */
export class SyncError extends Error {
  readonly code: SyncErrorCode;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(code: SyncErrorCode, message: string, details?: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = "SyncError";
    this.code = code;
    this.details = details;
  }
}

export function isSyncError(error: unknown, code?: SyncErrorCode): error is SyncError {
  return error instanceof SyncError && (code === undefined || error.code === code);
}
