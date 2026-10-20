import { PAYMENT_INTENT_ENTITY, type PayOrderPayload } from "@fnb/contracts";
import { compareVnd, vnd } from "@fnb/domain";
import { transitionPaymentIntent } from "@fnb/domain/payment";
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

/**
 * A QR transfer pays an order only with money the bank confirmed for it: an intent of this
 * order, matched to a transfer that brought exactly its amount, put down at that amount.
 * Anything less certain (nothing yet, too little, too much) is for a person to settle.
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
    if (intent.status !== "paid")
      throw new CommandRejection(PAYMENT_SYNC_ERROR_CODES.intentNotPaid);
    if (compareVnd(intent.amount, vnd(tender.amount)) !== 0) {
      throw new CommandRejection(PAYMENT_SYNC_ERROR_CODES.intentAmountMismatch);
    }
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
