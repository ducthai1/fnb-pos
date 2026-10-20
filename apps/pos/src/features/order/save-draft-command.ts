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
    tableId: order.table?.id ?? null,
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

/**
 * order.save_draft with the whole cart, opened or saved again; the server prices it. With
 * `expectedVersion` (the version the cart was edited from, 0 for a new order) the server
 * saves it only over that version, so a save never wipes what another till added meanwhile.
 */
export function saveDraftCommand(
  place: TillPlace,
  order: CounterOrder,
  priced: PricedCounterOrder,
  state: TillOrderState,
  at: number,
  expectedVersion?: number,
): LocalCommand {
  return tillCommand(
    place,
    "order.save_draft",
    saveDraftPayloadSchema,
    { ...draftPayload(order), ...(expectedVersion === undefined ? {} : { expectedVersion }) },
    at,
    {
      entity: "order",
      entityId: order.orderId,
      optimistic: tillOrderSnapshot(place, order, priced, state),
    },
  );
}
