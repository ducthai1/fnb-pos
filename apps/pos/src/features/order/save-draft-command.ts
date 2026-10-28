import { type SaveDraftPayload, saveDraftPayloadSchema } from "@fnb/contracts";
import { quantityToDecimalString } from "@fnb/domain";
import type { LocalCommand } from "@fnb/sync-client";
import type { CartLine, CounterOrder } from "./counter-order";
import { type TillOrderState, tillOrderSnapshot } from "./order-snapshot-for-till";
import type { PricedCounterOrder } from "./price-counter-order";
import { type TillPlace, moneyToWire, tillCommand } from "./till-command";

/**
 * The quantity a line is sent with: its units, or, sold by weight, its weight in the unit the
 * product's price is per, exactly as the till priced it (`priced` holds that item line).
 */
function quantitySent(line: CartLine, priced: PricedCounterOrder | undefined): string {
  if (line.grams === undefined) return String(line.quantity);
  const item = priced?.lines.find((candidate) => candidate.id === line.lineId);
  if (item === undefined) throw new Error(`weighed line ${line.lineId} was not priced`);
  return quantityToDecimalString(item.quantity);
}

/**
 * The draft as the contract carries it: lines of intent, no price but the one the cashier
 * typed (and the manager's approval of it, if one was needed).
 */
export function draftPayload(order: CounterOrder, priced?: PricedCounterOrder): SaveDraftPayload {
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
      quantity: quantitySent(line, priced),
      note: line.note,
      ...(line.enteredPrice === undefined ? {} : { enteredPrice: moneyToWire(line.enteredPrice) }),
      ...(line.priceApprovalId === undefined ? {} : { priceApprovalId: line.priceApprovalId }),
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
    {
      ...draftPayload(order, priced),
      ...(expectedVersion === undefined ? {} : { expectedVersion }),
    },
    at,
    {
      entity: "order",
      entityId: order.orderId,
      optimistic: tillOrderSnapshot(place, order, priced, state),
    },
  );
}
