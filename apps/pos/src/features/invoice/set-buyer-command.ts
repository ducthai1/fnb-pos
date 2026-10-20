import { type EInvoiceBuyer, type EntitySnapshot, setBuyerInfoPayloadSchema } from "@fnb/contracts";
import type { LocalCommand } from "@fnb/sync-client";
import { type TillPlace, tillCommand } from "../order/till-command";

/**
 * order.set_buyer_info: who the invoice is for (null: back to a retail customer). It waits
 * on a draft for the payment's invoice, or changes a paid order's invoice until it was sent
 * to the provider. The order's row does not change by it (the buyer stays on the server),
 * so the till expects `order` as it is.
 */
export function setBuyerCommand(
  place: TillPlace,
  orderId: string,
  buyer: EInvoiceBuyer | null,
  order: EntitySnapshot,
  at: number,
): LocalCommand {
  return tillCommand(
    place,
    "order.set_buyer_info",
    setBuyerInfoPayloadSchema,
    { orderId, buyer },
    at,
    { entity: "order", entityId: orderId, optimistic: order },
  );
}
