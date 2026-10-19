/**
 * A misuse of the flag or configuration API, with a stable code from
 * `feature-flags-error-codes.ts` so callers and tests can tell failures apart.
 */
export class FeatureFlagError extends Error {
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(code: string, message: string, details?: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = "FeatureFlagError";
    this.code = code;
    this.details = details;
  }
}
