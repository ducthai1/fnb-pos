import type { ClaimedInvoice } from "./einvoice-claims";
import { EINVOICE_FAILURE_CODES } from "./einvoice-error-codes";
import type { IssueOutcome } from "./einvoice-outcomes";
import type { EInvoiceProvider, ProviderFailure } from "./einvoice-provider";

/**
 * Where the worker gets the signal that gives a provider call up. Production uses the
 * system timer; tests hand in their manual clock, which fires it when they move time on,
 * so the call's deadline and the row's lease run on the same time.
 */
export interface CallDeadlines {
  /** A signal that aborts `ms` from now. */
  signalAfter(ms: number): AbortSignal;
}

export const systemDeadlines: CallDeadlines = {
  signalAfter: (ms) => AbortSignal.timeout(ms),
};

/**
 * The provider's answer, a call that threw counted as a temporary failure: a dropped
 * connection may still have reached the provider, which the next attempt asks about
 * before sending again. A call that threw once `signal` fired was given up for time.
 */
export async function askProvider<T>(
  call: () => Promise<T>,
  signal: AbortSignal,
): Promise<T | ProviderFailure> {
  try {
    return await call();
  } catch {
    const code = signal.aborted
      ? EINVOICE_FAILURE_CODES.providerTimedOut
      : EINVOICE_FAILURE_CODES.providerUnreachable;
    return { ok: false, failure: "temporary", code };
  }
}

/**
 * Sends a claimed invoice, unless it was sent before: an earlier attempt may have been
 * issued with its answer lost (a timeout, a worker that died), so the provider is first
 * asked what it holds under the invoice's id, and an invoice it has is recorded with that
 * number instead of being sent a second time, which a provider that does not honour the
 * idempotency key would issue again. A lookup that fails is this attempt's failure: the
 * invoice is not sent blind.
 */
export async function issueOrRecover(
  provider: EInvoiceProvider,
  claimed: ClaimedInvoice,
  signal: AbortSignal,
): Promise<IssueOutcome> {
  const call = { signal };
  if (claimed.attempts > 1) {
    const held = await askProvider(() => provider.lookup(claimed.id, call), signal);
    if (!("found" in held)) return held;
    if (held.found) {
      const { number, taxAuthorityCode, lookupCode, lookupUrl } = held;
      return { ok: true, number, taxAuthorityCode, lookupCode, lookupUrl };
    }
  }
  return askProvider(() => provider.issue(claimed.document, call), signal);
}
