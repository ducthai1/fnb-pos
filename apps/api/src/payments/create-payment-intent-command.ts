import { type CreatePaymentIntentPayload, createPaymentIntentPayloadSchema } from "@fnb/contracts";
import { compareVnd, computeOrderTotals, vnd } from "@fnb/domain";
import { draftOfBranch } from "../sync/editable-order";
import type { SyncCommandContext } from "../sync/sync-command-context";
import { defineSyncCommand } from "../sync/sync-command-definition";
import { CommandRejection, SYNC_ERROR_CODES } from "../sync/sync-error-codes";
import { PAYMENT_SYNC_ERROR_CODES } from "./payment-error-codes";
import {
  settleIntentWithTransfer,
  transferPaysIntent,
  unclaimedTransfers,
} from "./payment-intent-settlement";
import { readPaymentIntent } from "./payment-intent-store";

/**
 * How long a QR stays payable from the moment the till showed it. Long enough for a
 * customer who fumbles with a banking app; short enough that a stale QR left on a screen
 * is not paid against an order that changed since. A transfer after it waits for a person.
 */
export const PAYMENT_INTENT_LIFETIME_MS = 15 * 60_000;

/**
 * How far back a new intent looks for a transfer that already arrived with its code: the
 * till may have shown the QR offline and synced only after the customer paid. The code is
 * random, so the window only bounds the search; it is wide for tills with a wrong clock.
 */
const ARRIVED_BEFORE_SYNC_WINDOW_MS = 24 * 60 * 60_000;

/**
 * payment.create_intent: the till showed a VietQR for the order. The amount must be what
 * the server says the order comes to now, or the customer pays for a bill that no longer
 * exists. A transfer naming the code that reached the server before the intent did (the
 * till was offline) is matched at once. Returns the intent id.
 */
async function createPaymentIntent(
  context: SyncCommandContext,
  payload: CreatePaymentIntentPayload,
) {
  const { client, device, staffId, command } = context;
  const stored = await draftOfBranch(context, payload.orderId);
  const { amountDue } = computeOrderTotals(stored.order, stored.chargeProfile);
  if (compareVnd(amountDue, vnd(payload.amount)) !== 0) {
    throw new CommandRejection(SYNC_ERROR_CODES.orderTotalMismatch);
  }
  if ((await readPaymentIntent(client, payload.intentId, false)) !== null) {
    throw new CommandRejection(PAYMENT_SYNC_ERROR_CODES.intentIdTaken);
  }
  const live = await client.query<{ order_id: string }>(
    "SELECT order_id FROM payment_intent WHERE status = 'pending' " +
      "AND (order_id = $1 OR content_code = $2)",
    [payload.orderId, payload.contentCode],
  );
  if (live.rows.some((row) => row.order_id === payload.orderId)) {
    throw new CommandRejection(PAYMENT_SYNC_ERROR_CODES.intentAlreadyPending);
  }
  if (live.rows.length > 0) throw new CommandRejection(PAYMENT_SYNC_ERROR_CODES.contentCodeTaken);
  const shownAt = new Date(command.createdAt);
  const expiresAt = new Date(shownAt.getTime() + PAYMENT_INTENT_LIFETIME_MS);
  await client.query(
    "INSERT INTO payment_intent (id, tenant_id, order_id, branch_id, device_id, amount, " +
      "content_code, expires_at, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    [
      payload.intentId,
      device.tenantId,
      payload.orderId,
      device.branchId,
      device.deviceId,
      payload.amount,
      payload.contentCode,
      expiresAt,
      staffId,
    ],
  );
  const intent = await readPaymentIntent(client, payload.intentId, true);
  if (intent === null) throw new Error("the intent just written is not readable");
  const lookFrom = new Date(expiresAt.getTime() - ARRIVED_BEFORE_SYNC_WINDOW_MS);
  const arrived = await unclaimedTransfers(client, device.branchId, lookFrom, expiresAt);
  const paying = arrived.find((transfer) => transferPaysIntent(transfer, intent));
  if (paying !== undefined) await settleIntentWithTransfer(client, intent, paying);
  return payload.intentId;
}

export const createPaymentIntentCommand = defineSyncCommand(
  "payment.create_intent",
  createPaymentIntentPayloadSchema,
  createPaymentIntent,
  "payment_intent",
);
