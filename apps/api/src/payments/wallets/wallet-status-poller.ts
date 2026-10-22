import { PAYMENT_INTENT_ENTITY } from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import { transitionPaymentIntent } from "@fnb/domain/payment";
import type pg from "pg";
import type { Clock } from "../../clock";
import { appendChange, lockTenantChangeFeed } from "../../sync/change-feed";
import {
  INTENT_COLUMNS,
  type PaymentIntentRow,
  type StoredPaymentIntent,
  intentOfRow,
  paymentIntentSnapshotOf,
  readPaymentIntent,
  setIntentStatus,
} from "../payment-intent-store";
import type { WebhookSecretBox } from "../webhook-secret-box";
import { openWalletAccounts } from "./wallet-account-store";
import {
  type WalletGatewayAdapter,
  WalletGatewayError,
  type WalletPaymentStatus,
} from "./wallet-gateway-adapter";
import { settleWalletPayment } from "./wallet-payment-settlement";
import { GIVE_UP_AFTER_EXPIRY_MS, nextQueryDelayMs } from "./wallet-query-schedule";

export interface WalletPollDependencies {
  readonly pool: pg.Pool;
  readonly clock: Clock;
  readonly box: WebhookSecretBox;
  readonly wallets: ReadonlyMap<string, WalletGatewayAdapter>;
}

/** What a round did: intents settled by the wallet's answer, expired, or asked again later. */
export interface WalletPollRound {
  settled: number;
  expired: number;
  waiting: number;
}

const TENANTS_PER_ROUND = 50;
const INTENTS_PER_TENANT = 100;
const QUERY_TIMEOUT_MS = 10_000;

interface Claimed {
  readonly intent: StoredPaymentIntent;
  readonly wallet: string;
  readonly gatewayRef: string;
}

/**
 * Asks the wallets about every pending wallet intent that is due, once. The wallet's
 * notice is the fast path; this is the one that cannot be lost (the notice can be, and a
 * sandbox never reaches a shop's server at all). A paid answer goes through the same
 * settlement as a notice, so whichever comes second changes nothing.
 */
export async function runWalletPollOnce(deps: WalletPollDependencies): Promise<WalletPollRound> {
  const round: WalletPollRound = { settled: 0, expired: 0, waiting: 0 };
  if (deps.wallets.size === 0) return round;
  const { rows } = await deps.pool.query<{ tenant_id: string }>(
    "SELECT fnb_jobs.tenants_with_due_work($1, $2, $3) AS tenant_id",
    [deps.clock.now(), [...deps.wallets.keys()], TENANTS_PER_ROUND],
  );
  for (const { tenant_id: tenantId } of rows) {
    for (let item = 0; item < INTENTS_PER_TENANT; item++) {
      const outcome = await pollNextIntent(deps, tenantId);
      if (outcome === null) break;
      round[outcome] += 1;
    }
  }
  return round;
}

/**
 * Claims the most overdue intent of the tenant by moving its next question on (so another
 * poller skips it), asks the wallet with no transaction open, and records the answer.
 */
async function pollNextIntent(
  deps: WalletPollDependencies,
  tenantId: string,
): Promise<keyof WalletPollRound | null> {
  const now = deps.clock.now();
  const claimed = await withTenant(deps.pool, tenantId, async (client) => {
    const { rows } = await client.query<
      PaymentIntentRow & { wallet: string; gateway_ref: string; query_attempts: number }
    >(
      `SELECT ${INTENT_COLUMNS}, wallet, gateway_ref, query_attempts FROM payment_intent ` +
        "WHERE status = 'pending' AND wallet = ANY ($1::text[]) AND next_query_at <= $2 " +
        "ORDER BY next_query_at, id LIMIT 1 FOR UPDATE SKIP LOCKED",
      [[...deps.wallets.keys()], now],
    );
    const row = rows[0];
    if (row === undefined) return null;
    await client.query(
      "UPDATE payment_intent SET query_attempts = query_attempts + 1, " +
        "next_query_at = $2::timestamptz + make_interval(secs => $3::double precision / 1000) " +
        "WHERE id = $1",
      [row.id, now, nextQueryDelayMs(row.query_attempts)],
    );
    return { intent: intentOfRow(row), wallet: row.wallet, gatewayRef: row.gateway_ref };
  });
  if (claimed === null) return null;
  const status = await askWallet(deps, tenantId, claimed);
  return withTenant(deps.pool, tenantId, (client) =>
    recordAnswer(client, deps, tenantId, claimed, status),
  );
}

async function askWallet(
  deps: WalletPollDependencies,
  tenantId: string,
  claimed: Claimed,
): Promise<WalletPaymentStatus | null> {
  const adapter = deps.wallets.get(claimed.wallet);
  if (adapter === undefined) return null;
  const [account] = await withTenant(deps.pool, tenantId, (client) =>
    openWalletAccounts(client, deps.box, tenantId, claimed.wallet, claimed.intent.branchId),
  );
  if (account === undefined) return null;
  try {
    return await adapter.queryStatus(
      account.credentials,
      claimed.gatewayRef,
      AbortSignal.timeout(QUERY_TIMEOUT_MS),
    );
  } catch (error) {
    if (error instanceof WalletGatewayError) return null;
    throw error;
  }
}

async function recordAnswer(
  client: pg.ClientBase,
  deps: WalletPollDependencies,
  tenantId: string,
  claimed: Claimed,
  status: WalletPaymentStatus | null,
): Promise<keyof WalletPollRound> {
  const now = deps.clock.now();
  if (status?.status === "paid") {
    await settleWalletPayment(client, {
      tenantId,
      branchId: claimed.intent.branchId,
      wallet: claimed.wallet,
      report: { gatewayRef: claimed.gatewayRef, ...status },
      heardBy: "query",
      raw: { ...status, amount: status.amount.toString() },
      receivedAt: now,
    });
    return "settled";
  }
  const expiry = claimed.intent.expiresAt.getTime();
  const final = status?.status === "failed" && now.getTime() >= expiry;
  const givenUp = now.getTime() >= expiry + GIVE_UP_AFTER_EXPIRY_MS;
  if (!final && !givenUp) return "waiting";
  await lockTenantChangeFeed(client, tenantId);
  const intent = await readPaymentIntent(client, claimed.intent.id, true);
  if (intent === null || intent.status !== "pending") return "waiting";
  const expired = await setIntentStatus(client, intent, transitionPaymentIntent("pending", "expired"));
  await client.query("UPDATE payment_intent SET next_query_at = NULL WHERE id = $1", [intent.id]);
  await appendChange(client, tenantId, {
    branchId: expired.branchId,
    entity: PAYMENT_INTENT_ENTITY,
    entityId: expired.id,
    snapshot: paymentIntentSnapshotOf(expired),
    commandId: null,
  });
  return "expired";
}

export interface RunningWalletPoller {
  stop(): Promise<void>;
}

/** Runs a round every `intervalMs` until stopped; a failed round is reported, not fatal. */
export function startWalletPoller(
  deps: WalletPollDependencies,
  options: { intervalMs: number; onError?: (error: unknown) => void },
): RunningWalletPoller {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let running: Promise<unknown> = Promise.resolve();
  const tick = () => {
    running = runWalletPollOnce(deps)
      .catch((error) => options.onError?.(error))
      .finally(() => {
        if (!stopped) timer = setTimeout(tick, options.intervalMs);
      });
  };
  timer = setTimeout(tick, options.intervalMs);
  return {
    async stop() {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      await running;
    },
  };
}
