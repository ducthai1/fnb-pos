import { withTenant } from "@fnb/db";
import type pg from "pg";
import type { Clock } from "../clock";
import { claimDueInvoice } from "./einvoice-claims";
import { EINVOICE_FAILURE_CODES } from "./einvoice-error-codes";
import { type RecordedOutcome, recordIssueOutcome } from "./einvoice-outcomes";
import type { EInvoiceProvider, ProviderFailure } from "./einvoice-provider";
import { DEFAULT_EINVOICE_RETRY_POLICY, type EInvoiceRetryPolicy } from "./einvoice-retry-policy";

export interface EInvoiceWorkDependencies {
  /** Connects as the app role; tenants are found through fnb_jobs, then opened one by one. */
  readonly pool: pg.Pool;
  readonly clock: Clock;
  /** The worker takes only work of these providers: others are left for a worker that has them. */
  readonly providers: ReadonlyMap<string, EInvoiceProvider>;
  readonly policy?: EInvoiceRetryPolicy;
}

/** What a round did, by outcome. */
export type WorkerRound = Record<RecordedOutcome, number>;

const emptyRound = (): WorkerRound => ({ issued: 0, retrying: 0, failed: 0, stale: 0 });

/** Up to this many tenants per round, and items per tenant, so no shop starves the others. */
const TENANTS_PER_ROUND = 50;
const ITEMS_PER_TENANT = 100;

/**
 * Works through what is due once: the tenants with due work of the worker's providers, the
 * longest-waiting first, and in each its due invoices one at a time.
 */
export async function runEInvoiceWorkerOnce(deps: EInvoiceWorkDependencies): Promise<WorkerRound> {
  const round = emptyRound();
  const { rows } = await deps.pool.query<{ tenant_id: string }>(
    "SELECT fnb_jobs.tenants_with_due_work($1, $2, $3) AS tenant_id",
    [deps.clock.now(), [...deps.providers.keys()], TENANTS_PER_ROUND],
  );
  for (const { tenant_id: tenantId } of rows) {
    const done = await runEInvoiceWorkForTenant(deps, tenantId);
    for (const key of Object.keys(round) as RecordedOutcome[]) round[key] += done[key];
  }
  return round;
}

/**
 * One tenant's due work, now: what a round does for each tenant, and what a request runs
 * when it has just queued something the user is waiting for. Each invoice is claimed in a
 * transaction of its own, sent with no transaction open (a slow provider holds no lock),
 * and its outcome recorded in another, so two workers never send one invoice at once and
 * a worker that dies loses nothing.
 */
export async function runEInvoiceWorkForTenant(
  deps: EInvoiceWorkDependencies,
  tenantId: string,
): Promise<WorkerRound> {
  const round = emptyRound();
  for (let item = 0; item < ITEMS_PER_TENANT; item++) {
    const outcome = await issueNextInvoice(deps, tenantId);
    if (outcome === null) break;
    round[outcome] += 1;
  }
  return round;
}

async function issueNextInvoice(
  deps: EInvoiceWorkDependencies,
  tenantId: string,
): Promise<RecordedOutcome | null> {
  const policy = deps.policy ?? DEFAULT_EINVOICE_RETRY_POLICY;
  const providers = [...deps.providers.keys()];
  const claimed = await withTenant(deps.pool, tenantId, (client) =>
    claimDueInvoice(client, { now: deps.clock.now(), leaseMs: policy.leaseMs, providers }),
  );
  if (claimed === null) return null;
  const provider = deps.providers.get(claimed.provider);
  if (provider === undefined) throw new Error(`claimed an invoice of ${claimed.provider}`);
  const outcome = await askProvider(() => provider.issue(claimed.document));
  return withTenant(deps.pool, tenantId, (client) =>
    recordIssueOutcome(client, { tenantId, now: deps.clock.now(), policy }, claimed, outcome),
  );
}

/**
 * The provider's answer, a call that threw counted as a temporary failure: a dropped
 * connection may still have reached the provider, and its idempotency key makes the
 * retry safe.
 */
export async function askProvider<T extends { readonly ok: boolean }>(
  call: () => Promise<T>,
): Promise<T | ProviderFailure> {
  try {
    return await call();
  } catch {
    return { ok: false, failure: "temporary", code: EINVOICE_FAILURE_CODES.providerUnreachable };
  }
}

export interface RunningWorker {
  /** Stops the loop and waits for the round in progress, if any, to finish. */
  stop(): Promise<void>;
}

/**
 * Runs rounds in the API process, `intervalMs` apart, until stopped. A round that throws
 * (the database is away) is reported and the loop carries on: the work stays queued.
 */
export function startEInvoiceWorker(
  deps: EInvoiceWorkDependencies,
  options: { intervalMs: number; onError?: (error: unknown) => void },
): RunningWorker {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> = Promise.resolve();
  const tick = () => {
    running = runEInvoiceWorkerOnce(deps)
      .then(() => undefined, options.onError ?? (() => undefined))
      .finally(() => {
        if (!stopped) timer = setTimeout(tick, options.intervalMs);
      });
  };
  timer = setTimeout(tick, 0);
  return {
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await running;
    },
  };
}
