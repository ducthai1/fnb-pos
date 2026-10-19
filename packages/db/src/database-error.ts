/**
 * Infrastructure failures raised by this package carry a stable code (declared in
 * `db-error-codes.ts`) so callers and tests can tell them apart without parsing messages.
 */
export class DatabaseError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DatabaseError";
    this.code = code;
  }
}

export function isDatabaseError(error: unknown, code?: string): error is DatabaseError {
  return error instanceof DatabaseError && (code === undefined || error.code === code);
}
