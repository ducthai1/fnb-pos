import { type SetBuyerInfoPayload, setBuyerInfoPayloadSchema } from "@fnb/contracts";
import { readStoredOrder } from "../sync/stored-order";
import type { SyncCommandContext } from "../sync/sync-command-context";
import { defineSyncCommand } from "../sync/sync-command-definition";
import { CommandRejection, SYNC_ERROR_CODES } from "../sync/sync-error-codes";
import { EINVOICE_ERROR_CODES as CODES } from "./einvoice-error-codes";
import { invoicingProfileOf } from "./queue-einvoice";

/**
 * order.set_buyer_info: what the customer wants on the invoice. On a draft it waits on the
 * order and goes into the invoice the payment queues; on a paid order it changes the
 * queued invoice, but only before the invoice was ever sent to the provider. Answers the
 * order id; the buyer stays off the order's snapshot.
 */
async function setBuyerInfo(context: SyncCommandContext, payload: SetBuyerInfoPayload) {
  const { client, device } = context;
  const stored = await readStoredOrder(client, payload.orderId, true);
  if (stored === null || stored.branchId !== device.branchId) {
    throw new CommandRejection(SYNC_ERROR_CODES.orderNotFound);
  }
  const buyer = payload.buyer === null ? null : JSON.stringify(payload.buyer);
  const { status } = stored.order;
  if (status === "cancelled") throw new CommandRejection(CODES.orderClosed);
  if (status === "draft") {
    if ((await invoicingProfileOf(context)) === null) throw new CommandRejection(CODES.disabled);
    await client.query("UPDATE sales_order SET einvoice_buyer = $2 WHERE id = $1", [
      payload.orderId,
      buyer,
    ]);
    return payload.orderId;
  }
  // Locked: a worker claiming the invoice and this change are serialised, and the claim
  // counts as sending it.
  const { rows } = await client.query<{ id: string; attempts: number }>(
    "SELECT id, attempts FROM einvoice WHERE order_id = $1 FOR UPDATE",
    [payload.orderId],
  );
  const invoice = rows[0];
  if (invoice === undefined) {
    const enabled = (await invoicingProfileOf(context)) !== null;
    throw new CommandRejection(enabled ? CODES.invoiceNotFound : CODES.disabled);
  }
  if (invoice.attempts > 0) throw new CommandRejection(CODES.alreadySent);
  await client.query(
    "UPDATE einvoice SET buyer = $2, updated_at = $3, version = version + 1 WHERE id = $1",
    [invoice.id, buyer, context.receivedAt],
  );
  return payload.orderId;
}

export const setBuyerInfoCommand = defineSyncCommand(
  "order.set_buyer_info",
  setBuyerInfoPayloadSchema,
  setBuyerInfo,
);
