/**
 * A print job that cannot be encoded as asked, with a stable code from
 * `printing-error-codes.ts`. Refusing is safer than printing: a byte outside a command's
 * range is read by the printer as the start of another command, or as text.
 */
export class PrintingError extends Error {
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(code: string, message: string, details?: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = "PrintingError";
    this.code = code;
    this.details = details;
  }
}

export function isPrintingError(error: unknown, code?: string): error is PrintingError {
  return error instanceof PrintingError && (code === undefined || error.code === code);
}
