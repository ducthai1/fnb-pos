import { type SaveDraftPayload, saveDraftPayloadSchema } from "@fnb/contracts";
import type { LocalCommand } from "@fnb/sync-client";
import type { CounterOrder } from "./counter-order";
import { type TillOrderState, tillOrderSnapshot } from "./order-snapshot-for-till";
import type { PricedCounterOrder } from "./price-counter-order";
import { type TillPlace, tillCommand } from "./till-command";

/** The draft as the contract carries it: lines of intent, no price anywhere. */
export function draftPayload(order: CounterOrder): SaveDraftPayload {
  return {
    orderId: order.orderId,
    deviceOrderNo: order.deviceOrderNo,
    serviceType: order.serviceType,
    channelKey: null,
    tableId: null,
    tableTag: order.tableTag,
    lines: order.lines.map((line) => ({
      lineId: line.lineId,
      productId: line.productId,
      variantId: line.variantId,
      modifiers: line.modifiers.map(({ groupId, optionId, quantity }) => ({
        groupId,
        optionId,
        quantity,
      })),
      quantity: String(line.quantity),
      note: line.note,
    })),
  };
}

/** order.save_draft with the whole cart, opened or saved again; the server prices it. */
export function saveDraftCommand(
  place: TillPlace,
  order: CounterOrder,
  priced: PricedCounterOrder,
  state: TillOrderState,
  at: number,
): LocalCommand {
  return tillCommand(
    place,
    "order.save_draft",
    saveDraftPayloadSchema,
    { ...draftPayload(order) },
    at,
    {
      entity: "order",
      entityId: order.orderId,
      optimistic: tillOrderSnapshot(place, order, priced, state),
    },
  );
}
