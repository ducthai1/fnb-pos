import {
  PAYMENT_INTENT_ENTITY,
  type EntitySnapshot,
  type PaymentIntentSnapshot,
  payOrderPayloadSchema,
  paymentIntentSnapshotSchema,
} from "@fnb/contracts";
import { vnd } from "@fnb/domain";
import type { LocalCommand, SyncClient } from "@fnb/sync-client";
import { type TillPlace, tillCommand } from "../order/till-command";
import { PAYMENT_METHODS, type Tender } from "./tenders";

/** The code a payment, cancel or new QR is refused with while a paid QR of the order waits. */
export const ORDER_HAS_SETTLED_QR = "SYNC_ORDER_HAS_SETTLED_QR";

/** An intent row the till holds, read by its contract; null when unreadable. */
export function readIntentSnapshot(snapshot: EntitySnapshot): PaymentIntentSnapshot | null {
  const parsed = paymentIntentSnapshotSchema.safeParse(snapshot);
  return parsed.success ? parsed.data : null;
}

/**
 * The QR of the order the bank paid exactly, as this till last heard of it: the money that
 * must close the order. Null while the till knows of none.
 */
export async function paidQrOfOrder(
  client: Pick<SyncClient, "snapshots">,
  orderId: string,
): Promise<PaymentIntentSnapshot | null> {
  for (const view of await client.snapshots(PAYMENT_INTENT_ENTITY)) {
    const intent = readIntentSnapshot(view.snapshot);
    if (intent !== null && intent.orderId === orderId && intent.status === "paid") return intent;
  }
  return null;
}

/** The transfer a paid QR brought, as the tender that pays the order with it. */
export function qrTenderOf(intent: PaymentIntentSnapshot): Tender {
  return {
    method: PAYMENT_METHODS.qrTransfer,
    amount: vnd(intent.amount),
    paymentIntentId: intent.id,
  };
}

/**
 * order.pay with the paid QR alone, for an order whose earlier payment the server refused
 * because that QR was paid: the cash handed back, the order is closed with the bank's money.
 * Built from the order as the till shows it, since the counter may have moved on since. It
 * names the shift it is paid into, as every sale does: the server refuses one that has none.
 */
export function closeWithSettledQrCommand(
  place: TillPlace,
  order: EntitySnapshot,
  intent: PaymentIntentSnapshot,
  shiftId: string,
  at: number,
): LocalCommand {
  const payment = { method: PAYMENT_METHODS.qrTransfer, amount: intent.amount };
  const payload = {
    orderId: intent.orderId,
    payments: [{ ...payment, paymentIntentId: intent.id }],
    expectedAmountDue: intent.amount,
    shiftId,
  };
  const version = typeof order.version === "number" ? order.version + 1 : 1;
  return tillCommand(place, "order.pay", payOrderPayloadSchema, payload, at, {
    entity: "order",
    entityId: intent.orderId,
    optimistic: {
      ...order,
      status: "paid",
      version,
      payments: [{ ...payment, paymentIntentId: intent.id }],
    },
  });
}
