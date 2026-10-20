import {
  PAYMENT_INTENT_ENTITY,
  type PaymentAccount,
  type PaymentIntentSnapshot,
  cancelPaymentIntentPayloadSchema,
  createPaymentIntentPayloadSchema,
} from "@fnb/contracts";
import type { Vnd } from "@fnb/domain";
import { buildVietQrPayload, contentCodeFromRandom } from "@fnb/domain/payment";
import type { LocalCommand } from "@fnb/sync-client";
import { newId } from "../ids/new-id";
import { type TillPlace, moneyToWire, tillCommand } from "../order/till-command";

/**
 * How long the server keeps a QR payable from when it hears of it. The till shows this
 * guess only until the server's answer brings the real expiry, which is the one that counts:
 * the till's clock can be off by minutes, the server's decides.
 */
export const QR_LIFETIME_ESTIMATE_MS = 15 * 60_000;

const CODE_RANDOM_BYTES = 8;

/** Random bytes for the transfer code; tests pass a fixed source. */
export type RandomBytes = (bytes: Uint8Array) => Uint8Array;
const cryptoRandom: RandomBytes = (bytes) => crypto.getRandomValues(bytes);

/** A QR the till drew for an order: what the customer scans, and the command registering it. */
export interface DrawnQr {
  readonly intentId: string;
  /** What the customer's bank puts in the transfer's description; it is matched by this. */
  readonly contentCode: string;
  /** The VietQR text the code image encodes. */
  readonly payload: string;
  readonly command: LocalCommand;
}

/**
 * A one-time VietQR for the order's whole amount due, built on the till from the branch's
 * account so it shows even offline, and payment.create_intent telling the server to watch
 * for a transfer naming its code. The server checks the amount against its own total.
 */
export function drawQr(
  place: TillPlace,
  account: PaymentAccount,
  order: { readonly orderId: string; readonly amountDue: Vnd },
  at: number,
  random: RandomBytes = cryptoRandom,
): DrawnQr {
  const intentId = newId();
  const contentCode = contentCodeFromRandom(random(new Uint8Array(CODE_RANDOM_BYTES)));
  const payload = buildVietQrPayload({
    bankBin: account.bankBin,
    accountNumber: account.accountNumber,
    amount: order.amountDue,
    content: contentCode,
  });
  const amount = moneyToWire(order.amountDue);
  const optimistic: PaymentIntentSnapshot = {
    id: intentId,
    orderId: order.orderId,
    branchId: place.branchId,
    amount,
    contentCode,
    status: "pending",
    expiresAt: new Date(at + QR_LIFETIME_ESTIMATE_MS).toISOString(),
    receivedAmount: null,
    version: 1,
  };
  const command = tillCommand(
    place,
    "payment.create_intent",
    createPaymentIntentPayloadSchema,
    { intentId, orderId: order.orderId, amount, contentCode },
    at,
    { entity: PAYMENT_INTENT_ENTITY, entityId: intentId, optimistic },
  );
  return { intentId, contentCode, payload, command };
}

/**
 * payment.cancel_intent: the QR comes down, so a transfer arriving for it later waits for a
 * person instead of paying an order that was settled another way or drew a new QR.
 */
export function cancelQrCommand(
  place: TillPlace,
  intent: PaymentIntentSnapshot,
  at: number,
): LocalCommand {
  return tillCommand(
    place,
    "payment.cancel_intent",
    cancelPaymentIntentPayloadSchema,
    { intentId: intent.id },
    at,
    {
      entity: PAYMENT_INTENT_ENTITY,
      entityId: intent.id,
      optimistic: { ...intent, status: "cancelled", version: intent.version + 1 },
    },
  );
}
