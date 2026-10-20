/**
 * How the worker retries work an outside service refused for now. Waits double from the
 * first delay up to a ceiling, so a provider down all afternoon is asked about twice an
 * hour rather than every few seconds; past maxAttempts the row is failed for good and
 * flagged, since something no retry will fix (a revoked account, a changed API) needs a
 * person. The lease is how long a claimed row stays hidden from other workers while its
 * call is in flight; a worker that dies mid-call gives the row back when it runs out.
 */
export interface EInvoiceRetryPolicy {
  readonly maxAttempts: number;
  readonly firstDelayMs: number;
  readonly maxDelayMs: number;
  readonly leaseMs: number;
}

/** Twenty attempts reach the hourly ceiling after about 2 hours and cover about 15 hours. */
export const DEFAULT_EINVOICE_RETRY_POLICY: EInvoiceRetryPolicy = {
  maxAttempts: 20,
  firstDelayMs: 30_000,
  maxDelayMs: 3_600_000,
  leaseMs: 120_000,
};

/** The wait after the `attempts`-th failed call (1 for the first). */
export function retryDelayMs(policy: EInvoiceRetryPolicy, attempts: number): number {
  const doublings = Math.max(0, attempts - 1);
  // 2^31 ms is weeks: past that the ceiling has long applied, and the power would overflow.
  if (doublings >= 31) return policy.maxDelayMs;
  return Math.min(policy.firstDelayMs * 2 ** doublings, policy.maxDelayMs);
}
