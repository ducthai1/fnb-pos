import { type CancelPaymentIntentPayload, cancelPaymentIntentPayloadSchema } from "@fnb/contracts";
import { transitionPaymentIntent } from "@fnb/domain/payment";
import type { SyncCommandContext } from "../sync/sync-command-context";
import { defineSyncCommand } from "../sync/sync-command-definition";
import { CommandRejection } from "../sync/sync-error-codes";
import { PAYMENT_SYNC_ERROR_CODES } from "./payment-error-codes";
import { readPaymentIntent, setIntentStatus } from "./payment-intent-store";

/**
 * payment.cancel_intent: the till took its QR down. Only a pending intent can be withdrawn:
 * once a transfer was matched the money is the shop's, and the refusal hands the till the
 * intent as it now stands. Returns the intent id.
 */
async function cancelPaymentIntent(
  context: SyncCommandContext,
  payload: CancelPaymentIntentPayload,
) {
  const intent = await readPaymentIntent(context.client, payload.intentId, true);
  if (intent === null || intent.branchId !== context.device.branchId) {
    throw new CommandRejection(PAYMENT_SYNC_ERROR_CODES.intentNotFound);
  }
  await setIntentStatus(
    context.client,
    intent,
    transitionPaymentIntent(intent.status, "cancelled"),
  );
  return intent.id;
}

export const cancelPaymentIntentCommand = defineSyncCommand(
  "payment.cancel_intent",
  cancelPaymentIntentPayloadSchema,
  cancelPaymentIntent,
  "payment_intent",
);
