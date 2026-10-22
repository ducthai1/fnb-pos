import { randomBytes } from "node:crypto";
import {
  PAYMENT_INTENT_ENTITY,
  type WalletKey,
  type WalletPaymentAnswer,
  type WalletPaymentBody,
} from "@fnb/contracts";
import { withTenant } from "@fnb/db";
import { compareVnd, computeOrderTotals, vnd } from "@fnb/domain";
import { contentCodeFromRandom, transitionPaymentIntent } from "@fnb/domain/payment";
import type pg from "pg";
import type { DeviceAuth } from "../../devices/device-auth-hook";
import { appendChange, lockTenantChangeFeed } from "../../sync/change-feed";
import { readStoredOrder } from "../../sync/stored-order";
import { SYNC_ERROR_CODES } from "../../sync/sync-error-codes";
import { PAYMENT_INTENT_LIFETIME_MS } from "../create-payment-intent-command";
import { PAYMENT_SYNC_ERROR_CODES, WALLET_ROUTE_ERROR_CODES as CODES } from "../payment-error-codes";
import {
  type StoredPaymentIntent,
  paymentIntentSnapshotOf,
  readIntentsOfOrder,
  readPaymentIntent,
  setIntentStatus,
} from "../payment-intent-store";
import type { WebhookSecretBox } from "../webhook-secret-box";
import { openWalletAccounts } from "./wallet-account-store";
import { type WalletGatewayAdapter, WalletGatewayError } from "./wallet-gateway-adapter";
import { FIRST_QUERY_AFTER_MS } from "./wallet-query-schedule";

/** A code stays taken a week after its intent ran out, as for VietQR (see create intent). */
const CODE_RESERVED_FOR_MS = 7 * 24 * 60 * 60_000;
const CODE_DRAWS = 5;
/** How long the till's request waits for the wallet before giving the payment up. */
const WALLET_CALL_TIMEOUT_MS = 10_000;

export interface WalletPaymentDependencies {
  readonly pool: pg.Pool;
  readonly box: WebhookSecretBox;
  readonly wallets: ReadonlyMap<string, WalletGatewayAdapter>;
  /** The public base of the wallet notice route, or null when nothing outside reaches us. */
  readonly callbackBase: string | null;
}

export interface WalletPaymentRequestOf {
  readonly device: DeviceAuth;
  readonly staffId: string;
  readonly body: WalletPaymentBody;
  readonly now: Date;
}

export type WalletPaymentOutcome =
  | { readonly ok: true; readonly answer: WalletPaymentAnswer }
  | { readonly ok: false; readonly status: number; readonly code: string };

const refused = (status: number, code: string) => ({ ok: false, status, code }) as const;

interface Opening {
  readonly intent: StoredPaymentIntent;
  readonly gatewayRef: string;
  readonly description: string;
  readonly credentials: { appId: string; key1: string; key2: string };
  /** Set when the till asked again for a payment the wallet already opened. */
  readonly qrShown: string | null;
}

const answerOf = (intent: StoredPaymentIntent, wallet: WalletKey, qrContent: string) => ({
  ok: true as const,
  answer: { intent: paymentIntentSnapshotOf(intent), wallet, qrContent },
});

/**
 * Opens a wallet payment for an order, for a till that has the network. The amount asked
 * of the wallet is the server's own total of the order as stored; a till showing another
 * total is refused, as for VietQR. The intent is written first, in a transaction of its
 * own (so the one-live-intent-per-order rule holds while the wallet is called), the wallet
 * is called with no transaction open, and what to scan is kept on the intent; a wallet
 * that refuses or does not answer takes the intent down again, since no customer saw it.
 */
export async function openWalletPayment(
  deps: WalletPaymentDependencies,
  request: WalletPaymentRequestOf,
): Promise<WalletPaymentOutcome> {
  const { body, device } = request;
  const adapter = deps.wallets.get(body.wallet);
  if (adapter === undefined) return refused(404, CODES.unknownWallet);
  const opened = await withTenant(deps.pool, device.tenantId, (client) =>
    registerWalletIntent(client, deps, request, adapter),
  );
  if ("status" in opened) return opened;
  if (opened.qrShown !== null) return answerOf(opened.intent, body.wallet, opened.qrShown);
  let qrContent: string;
  try {
    const created = await adapter.createPayment(
      opened.credentials,
      {
        gatewayRef: opened.gatewayRef,
        amount: opened.intent.amount,
        description: opened.description,
        createdAt: request.now,
        expiresAt: opened.intent.expiresAt,
        callbackUrl:
          deps.callbackBase === null
            ? null
            : `${deps.callbackBase}/webhooks/wallets/${adapter.wallet}/${device.tenantId}`,
      },
      AbortSignal.timeout(WALLET_CALL_TIMEOUT_MS),
    );
    qrContent = created.qrContent;
  } catch (error) {
    if (!(error instanceof WalletGatewayError)) throw error;
    await withTenant(deps.pool, device.tenantId, (client) =>
      withdrawUnshown(client, device.tenantId, opened.intent.id),
    );
    return refused(502, CODES.unavailable);
  }
  const shown = await withTenant(deps.pool, device.tenantId, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      "UPDATE payment_intent SET wallet_qr = $2, updated_at = now() " +
        "WHERE id = $1 AND status = 'pending' RETURNING id",
      [opened.intent.id, qrContent],
    );
    return rows.length > 0 ? readPaymentIntent(client, opened.intent.id, false) : null;
  });
  if (shown === null) return refused(409, CODES.withdrawn);
  return answerOf(shown, body.wallet, qrContent);
}

async function registerWalletIntent(
  client: pg.PoolClient,
  deps: WalletPaymentDependencies,
  request: WalletPaymentRequestOf,
  adapter: WalletGatewayAdapter,
): Promise<Opening | ReturnType<typeof refused>> {
  const { body, device, now } = request;
  await lockTenantChangeFeed(client, device.tenantId);
  const existing = await readPaymentIntent(client, body.intentId, true);
  if (existing !== null) return replayOf(client, existing, request);
  const stored = await readStoredOrder(client, body.orderId, true);
  if (stored === null || stored.branchId !== device.branchId) {
    return refused(409, CODES.orderNotSynced);
  }
  if (stored.order.status !== "draft") return refused(409, CODES.orderNotOpen);
  const { amountDue } = computeOrderTotals(stored.order, stored.chargeProfile);
  if (compareVnd(amountDue, vnd(body.amount)) !== 0) {
    return refused(409, SYNC_ERROR_CODES.orderTotalMismatch);
  }
  if ((await readIntentsOfOrder(client, body.orderId, "paid")).length > 0) {
    return refused(409, PAYMENT_SYNC_ERROR_CODES.orderHasSettledQr);
  }
  if ((await readIntentsOfOrder(client, body.orderId, "pending")).length > 0) {
    return refused(409, PAYMENT_SYNC_ERROR_CODES.intentAlreadyPending);
  }
  const [account] = await openWalletAccounts(
    client,
    deps.box,
    device.tenantId,
    adapter.wallet,
    device.branchId,
  );
  if (account === undefined || !account.enabled) return refused(409, CODES.notEnabled);
  const code = await freeContentCode(client, now);
  const gatewayRef = adapter.gatewayRef(now, code);
  const expiresAt = new Date(now.getTime() + PAYMENT_INTENT_LIFETIME_MS);
  await client.query(
    "INSERT INTO payment_intent (id, tenant_id, order_id, branch_id, device_id, amount, " +
      "content_code, expires_at, created_by, wallet, gateway_ref, next_query_at) " +
      "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
    [
      body.intentId,
      device.tenantId,
      body.orderId,
      device.branchId,
      device.deviceId,
      amountDue,
      code,
      expiresAt,
      request.staffId,
      adapter.wallet,
      gatewayRef,
      new Date(now.getTime() + FIRST_QUERY_AFTER_MS),
    ],
  );
  const intent = await readPaymentIntent(client, body.intentId, true);
  if (intent === null) throw new Error("the wallet intent just written is not readable");
  await appendChange(client, device.tenantId, {
    branchId: intent.branchId,
    entity: PAYMENT_INTENT_ENTITY,
    entityId: intent.id,
    snapshot: paymentIntentSnapshotOf(intent),
    commandId: null,
  });
  const { rows } = await client.query<{ name: string }>("SELECT name FROM branch WHERE id = $1", [
    device.branchId,
  ]);
  const description = `${rows[0]?.name ?? ""} - Thanh toán đơn hàng`.slice(0, 200);
  return { intent, gatewayRef, description, credentials: account.credentials, qrShown: null };
}

/**
 * The till asked again with the same intent id (its first answer was lost): the same
 * payment, if it is this till's, for this order and wallet, still pending and shown.
 */
async function replayOf(
  client: pg.ClientBase,
  existing: StoredPaymentIntent,
  request: WalletPaymentRequestOf,
): Promise<Opening | ReturnType<typeof refused>> {
  const { rows } = await client.query<{ wallet: string | null; wallet_qr: string | null }>(
    "SELECT wallet, wallet_qr FROM payment_intent WHERE id = $1",
    [existing.id],
  );
  const row = rows[0];
  const same =
    existing.branchId === request.device.branchId &&
    existing.orderId === request.body.orderId &&
    row?.wallet === request.body.wallet &&
    existing.status === "pending" &&
    row.wallet_qr !== null;
  if (!same || row?.wallet_qr == null) return refused(409, PAYMENT_SYNC_ERROR_CODES.intentIdTaken);
  return {
    intent: existing,
    gatewayRef: "",
    description: "",
    credentials: { appId: "", key1: "", key2: "" },
    qrShown: row.wallet_qr,
  };
}

/** A transfer code no intent of the shop carried within the week, drawn on the server. */
async function freeContentCode(client: pg.ClientBase, now: Date): Promise<string> {
  for (let draw = 0; draw < CODE_DRAWS; draw++) {
    const code = contentCodeFromRandom(randomBytes(8));
    const { rowCount } = await client.query(
      "SELECT 1 FROM payment_intent WHERE content_code = $1 " +
        "AND (status = 'pending' OR expires_at > $2) LIMIT 1",
      [code, new Date(now.getTime() - CODE_RESERVED_FOR_MS)],
    );
    if ((rowCount ?? 0) === 0) return code;
  }
  throw new Error("no free transfer code after several draws");
}

/** Takes down an intent whose payment the wallet never opened, telling the branch's tills. */
async function withdrawUnshown(client: pg.ClientBase, tenantId: string, intentId: string) {
  await lockTenantChangeFeed(client, tenantId);
  const intent = await readPaymentIntent(client, intentId, true);
  if (intent === null || intent.status !== "pending") return;
  const withdrawn = await setIntentStatus(
    client,
    intent,
    transitionPaymentIntent(intent.status, "cancelled"),
  );
  await appendChange(client, tenantId, {
    branchId: withdrawn.branchId,
    entity: PAYMENT_INTENT_ENTITY,
    entityId: withdrawn.id,
    snapshot: paymentIntentSnapshotOf(withdrawn),
    commandId: null,
  });
}
