/**
 * Every rule violation in the domain throws a DomainError with a stable code.
 * Codes are declared next to the rules that raise them (`<area>/<area>-error-codes.ts`)
 * and the UI maps them to Vietnamese messages; the message here is for logs only.
 */
export class DomainError extends Error {
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(code: string, message: string, details?: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }
}

export function isDomainError(error: unknown, code?: string): error is DomainError {
  return error instanceof DomainError && (code === undefined || error.code === code);
}
