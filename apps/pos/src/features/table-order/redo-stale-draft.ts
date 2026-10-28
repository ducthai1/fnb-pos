import { SYNC_ORDER_VERSION_ERROR_CODES, saveDraftPayloadSchema } from "@fnb/contracts";
import { quantity, vnd } from "@fnb/domain";
import type { LocalCommand, RejectedCommand } from "@fnb/sync-client";
import type { TillMenu } from "../menu/till-menu";
import type { CartLine } from "../order/counter-order";
import { entryOfStored, openingFromStored } from "../order/order-opening";
import { priceCounterOrder } from "../order/price-counter-order";
import { saveDraftCommand } from "../order/save-draft-command";
import { type StoredOrder, readStoredOrder } from "../order/stored-order";
import type { TillPlace } from "../order/till-command";

export const ORDER_VERSION_STALE = SYNC_ORDER_VERSION_ERROR_CODES.orderVersionStale;

type Refused = Pick<RejectedCommand, "code" | "command" | "serverSnapshot">;

/** A draft the server refused because another till changed the order first. */
export const isStaleDraft = (refused: Pick<RejectedCommand, "code" | "command">) =>
  refused.command.type === "order.save_draft" && refused.code === ORDER_VERSION_STALE;

/**
 * The items a refused draft asked for, as the cart lines that save them: a typed price with
 * the approval it carried, a weight read back into grams in the product's unit.
 */
function cartAsked(menu: TillMenu, refused: Refused): CartLine[] {
  const payload = saveDraftPayloadSchema.safeParse(refused.command.payload);
  if (!payload.success) return [];
  return payload.data.lines.map((line) => {
    const item = {
      productId: line.productId,
      quantity: quantity(line.quantity),
      unitPrice: vnd(line.enteredPrice ?? 0),
      priceSource: line.enteredPrice === undefined ? "base" : "manual",
    } as const;
    return {
      lineId: line.lineId,
      productId: line.productId,
      variantId: line.variantId,
      modifiers: line.modifiers,
      ...entryOfStored(menu, item),
      note: line.note,
      ...(line.priceApprovalId === undefined ? {} : { priceApprovalId: line.priceApprovalId }),
    };
  });
}

/** The items of the order as the server held it when it refused, as cart lines. */
function cartRefusedOver(menu: TillMenu, refused: Refused): readonly CartLine[] {
  const stored = refused.serverSnapshot === null ? null : readStoredOrder(refused.serverSnapshot);
  return stored === null ? [] : openingFromStored(menu, stored).order.lines;
}

/**
 * The cart to save again over the order as the server holds it now (`latest`), after drafts
 * of this till (`refused`, oldest first) were refused because another till changed the order
 * first: every item the server holds; the items another till added that a later save of
 * this till took off again (in a refusal's copy, in none of this till's refused drafts, gone
 * from the server); then what this till's last refused draft added that the server lacks.
 * Null when there is nothing to add. An item one till took off may so come back: a lost
 * item costs the shop, one too many is seen on the screen and taken off again.
 */
export function redoneCart(
  menu: TillMenu,
  latest: StoredOrder,
  refused: readonly Refused[],
): CartLine[] | null {
  const held = openingFromStored(menu, latest).order.lines;
  const taken = new Set(held.map((line) => line.lineId));
  const asked = refused.map((entry) => cartAsked(menu, entry));
  const ours = new Set(asked.flat().map((line) => line.lineId));
  const added: CartLine[] = [];
  const add = (line: CartLine) => {
    if (taken.has(line.lineId)) return;
    taken.add(line.lineId);
    added.push(line);
  };
  for (const entry of refused) {
    for (const line of cartRefusedOver(menu, entry)) if (!ours.has(line.lineId)) add(line);
  }
  for (const line of asked.at(-1) ?? []) add(line);
  return added.length === 0 ? null : [...held, ...added];
}

/**
 * order.save_draft of `cart` over the order as the server holds it now, naming that version;
 * prices like any save, with the items the server keeps held as stored.
 */
export function redoDraftCommand(
  place: TillPlace,
  menu: TillMenu,
  latest: StoredOrder,
  cart: readonly CartLine[],
  at: number,
): LocalCommand {
  const opening = openingFromStored(menu, latest);
  const order = { ...opening.order, lines: cart };
  const profile = latest.chargeProfile;
  const priced = priceCounterOrder(menu, order, profile, at, opening.kept, opening.commandLines);
  const state = {
    status: "draft" as const,
    version: latest.version + 1,
    businessDate: latest.businessDate,
    chargeProfile: profile,
    payments: [],
    sent: latest.sent,
    preBillPrinted: false,
  };
  return saveDraftCommand(place, order, priced, state, at, latest.version);
}
