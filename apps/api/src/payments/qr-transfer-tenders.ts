import { PAYMENT_INTENT_ENTITY, type PayOrderPayload } from "@fnb/contracts";
import { type Vnd, compareVnd, vnd } from "@fnb/domain";
import { qrTenderAmount, transitionPaymentIntent } from "@fnb/domain/payment";
import { appendChange } from "../sync/change-feed";
import type { SyncCommandContext } from "../sync/sync-command-context";
import { CommandRejection } from "../sync/sync-error-codes";
import { PAYMENT_SYNC_ERROR_CODES } from "./payment-error-codes";
import {
  paymentIntentSnapshotOf,
  readIntentsOfOrder,
  readPaymentIntent,
  setIntentStatus,
} from "./payment-intent-store";

const SETTLED = new Set(["paid", "partial", "overpaid"]);

/**
 * A QR transfer pays an order only with money the bank confirmed for it: an intent of this
 * order, matched to a transfer, that no person handed back to the customer. Exact or over,
 * it pays what it asked for (the excess is the customer's, handed back apart from the sale);
 * short, it pays all it brought and another tender brings exactly the rest. Nothing yet is
 * for a person to settle, and the order still closes only when the tenders make its total.
 */
export async function assertQrTransfersArePaid(
  context: SyncCommandContext,
  orderId: string,
  tenders: PayOrderPayload["payments"],
): Promise<void> {
  for (const tender of tenders) {
    if (tender.paymentIntentId === undefined) continue;
    const intent = await readPaymentIntent(context.client, tender.paymentIntentId, true);
    if (intent === null || intent.branchId !== context.device.branchId) {
      throw new CommandRejection(PAYMENT_SYNC_ERROR_CODES.intentNotFound);
    }
    if (intent.orderId !== orderId) {
      throw new CommandRejection(PAYMENT_SYNC_ERROR_CODES.intentOfAnotherOrder);
    }
    if (!SETTLED.has(intent.status) || intent.receivedAmount === null) {
      throw new CommandRejection(PAYMENT_SYNC_ERROR_CODES.intentNotPaid);
    }
    if (await wasHandedBack(context, intent.id)) {
      throw new CommandRejection(PAYMENT_SYNC_ERROR_CODES.intentHandedBack);
    }
    const settlement = intent.status as "paid" | "partial" | "overpaid";
    const pays = qrTenderAmount(settlement, intent.amount, intent.receivedAmount);
    if (compareVnd(pays, vnd(tender.amount)) !== 0) {
      throw new CommandRejection(PAYMENT_SYNC_ERROR_CODES.intentAmountMismatch);
    }
  }
}

async function wasHandedBack(context: SyncCommandContext, intentId: string): Promise<boolean> {
  const { rows } = await context.client.query<{ handed_back: boolean }>(
    "SELECT refunded_at IS NOT NULL AS handed_back FROM payment_intent WHERE id = $1",
    [intentId],
  );
  return rows[0]?.handed_back === true;
}

/**
 * What QRs of the open order already brought short, that no person handed back: a further
 * QR asks for exactly the rest of the order beside them.
 */
export async function shortTransfersOfOrder(
  context: SyncCommandContext,
  orderId: string,
): Promise<Vnd[]> {
  const { rows } = await context.client.query<{ received_amount: string }>(
    "SELECT received_amount FROM payment_intent WHERE order_id = $1 AND status = 'partial' " +
      "AND refunded_at IS NULL ORDER BY id FOR UPDATE",
    [orderId],
  );
  return rows.map((row) => vnd(BigInt(row.received_amount)));
}

/**
 * Refuses to close or bill an order again while a QR of it holds money the bank confirmed
 * exactly and no payment uses (`usedIntentIds` are the QRs the command itself pays with).
 * Taking cash for it, cancelling it or showing a second QR would take the customer's money
 * twice, and no list would show it; refusing is safer than swapping the till's tender for
 * the QR, since the cashier really took that cash and must give it back. The till learns
 * of the paid QR from the feed and closes the order with it. A short or excess transfer
 * never blocks: no payment can use it, so it is listed for a person to refund instead.
 */
export async function assertNoPaidQrLeftOut(
  context: SyncCommandContext,
  orderId: string,
  usedIntentIds: readonly string[] = [],
): Promise<void> {
  const paid = await readIntentsOfOrder(context.client, orderId, "paid");
  if (paid.some((intent) => !usedIntentIds.includes(intent.id))) {
    throw new CommandRejection(PAYMENT_SYNC_ERROR_CODES.orderHasSettledQr);
  }
}

/**
 * Takes down the QR still out for an order that closes another way (paid in cash, or
 * cancelled), so a transfer arriving later is not counted as paying it twice: it waits for
 * a person instead. Each till of the branch learns of it through the change feed.
 */
export async function withdrawPendingIntents(context: SyncCommandContext, orderId: string) {
  const { client, device, command } = context;
  for (const intent of await readIntentsOfOrder(client, orderId, "pending")) {
    const withdrawn = await setIntentStatus(
      client,
      intent,
      transitionPaymentIntent(intent.status, "cancelled"),
    );
    await appendChange(client, device.tenantId, {
      branchId: withdrawn.branchId,
      entity: PAYMENT_INTENT_ENTITY,
      entityId: withdrawn.id,
      snapshot: paymentIntentSnapshotOf(withdrawn),
      commandId: command.commandId,
    });
  }
}
