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

/** The most a call's give-up time is kept clear of the lease's end. */
const MAX_LEASE_MARGIN_MS = 20_000;

/**
 * How long the worker waits on the provider before giving the call up: the lease less a
 * margin (a quarter of it, at most 20 s) for recording the outcome and for clocks of two
 * API instances that differ a little, so the outcome is recorded while the row is still
 * this worker's and no other worker sends it meanwhile.
 */
export function providerCallTimeoutMs(policy: EInvoiceRetryPolicy): number {
  return policy.leaseMs - Math.min(MAX_LEASE_MARGIN_MS, Math.floor(policy.leaseMs / 4));
}

/** The wait after the `attempts`-th failed call (1 for the first). */
export function retryDelayMs(policy: EInvoiceRetryPolicy, attempts: number): number {
  const doublings = Math.max(0, attempts - 1);
  // 2^31 ms is weeks: past that the ceiling has long applied, and the power would overflow.
  if (doublings >= 31) return policy.maxDelayMs;
  return Math.min(policy.firstDelayMs * 2 ** doublings, policy.maxDelayMs);
}

/** What a failed call leads to: another try at `due`, or a failure for a person to handle. */
export type AfterFailure =
  | { readonly status: "failed_retryable"; readonly due: Date; readonly code: string }
  | { readonly status: "failed_permanent"; readonly code: string };

/**
 * The step after the `attempts`-th call failed: a temporary failure is tried again after
 * the policy's wait, unless it was the last attempt allowed, which turns it permanent under
 * `exhaustedCode` (the provider's own code is still kept by the caller for the person).
 */
export function afterFailure(
  policy: EInvoiceRetryPolicy,
  failure: { readonly failure: "temporary" | "permanent"; readonly code: string },
  attempts: number,
  now: Date,
  exhaustedCode: string,
): AfterFailure {
  if (failure.failure === "permanent") return { status: "failed_permanent", code: failure.code };
  if (attempts >= policy.maxAttempts) return { status: "failed_permanent", code: exhaustedCode };
  const due = new Date(now.getTime() + retryDelayMs(policy, attempts));
  return { status: "failed_retryable", due, code: failure.code };
}
