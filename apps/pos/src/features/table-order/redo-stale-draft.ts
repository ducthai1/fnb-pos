import {
  SYNC_ORDER_VERSION_ERROR_CODES,
  markSentToKitchenPayloadSchema,
  saveDraftPayloadSchema,
} from "@fnb/contracts";
import {
  type SentLineState,
  addQuantity,
  quantity,
  quantityToDecimalString,
  vnd,
} from "@fnb/domain";
import type { LocalCommand, RejectedCommand, SyncClient } from "@fnb/sync-client";
import type { TillMenu } from "../menu/till-menu";
import type { CartLine } from "../order/counter-order";
import { entryOfStored, openingFromStored } from "../order/order-opening";
import { priceCounterOrder } from "../order/price-counter-order";
import { saveDraftCommand } from "../order/save-draft-command";
import { markSentCommand, withSent } from "../printing/print-commands";
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

/** A bar or kitchen ticket the printer took, whose recording the server refused. */
export interface HandedOverTicket {
  readonly ticketId: string;
  readonly stationId: string;
  readonly lines: readonly {
    lineId: string;
    kind: "new";
    quantity: string;
    note: string | null;
  }[];
}

const MARK_SENT = "order.mark_sent_to_kitchen";
const NOT_OWED = "SYNC_KITCHEN_NOT_OWED";

/**
 * Whether a refusal is a ticket recorded over items the server did not hold yet: the draft
 * that added them was refused as stale. Only tickets of new items qualify; a cancel or a
 * note change reported over an order the server holds differently stays a refusal to read.
 */
export function handedOverTicket(
  refused: Pick<RejectedCommand, "code" | "command">,
): HandedOverTicket | null {
  if (refused.command.type !== MARK_SENT || refused.code !== NOT_OWED) return null;
  const payload = markSentToKitchenPayloadSchema.safeParse(refused.command.payload);
  if (!payload.success) return null;
  const { stations, ticketId } = payload.data;
  const [station] = stations;
  if (stations.length !== 1 || station === undefined) return null;
  if (station.lines.some((line) => line.kind !== "new")) return null;
  const lines = station.lines.map((line) => ({
    lineId: line.lineId,
    kind: "new" as const,
    quantity: quantityToDecimalString(line.quantity),
    note: line.note,
  }));
  const ticket: HandedOverTicket = { ticketId, stationId: station.stationId, lines };
  return ticket;
}

/**
 * The tickets of the order the stations hold whose recording the server refused, with the
 * refused command of each; `mine` picks among them (a till's own, not yet recorded again).
 */
export async function refusedTickets(
  client: Pick<SyncClient, "rejectedCommands">,
  orderId: string,
  /** The redone order's items: a ticket of items it lacks is left a refusal to read. */
  cart: readonly CartLine[],
  mine: (commandId: string) => boolean = () => true,
): Promise<{ commandId: string; ticket: HandedOverTicket }[]> {
  const inCart = new Set(cart.map((line) => line.lineId));
  return (await client.rejectedCommands()).flatMap((entry) => {
    const ticket = handedOverTicket(entry);
    return ticket === null ||
      entry.entityId !== orderId ||
      !mine(entry.command.commandId) ||
      !ticket.lines.every((line) => inCart.has(line.lineId))
      ? []
      : [{ commandId: entry.command.commandId, ticket }];
  });
}

/**
 * order.save_draft of `cart` over the order as the server holds it now, naming that version;
 * prices like any save, with the items the server keeps held as stored. The tickets the
 * stations already hold for items of `cart` (printed while their save was still unanswered)
 * follow it as the commands that record them, so the stations are not told twice.
 */
export function redoDraftCommands(
  place: TillPlace,
  menu: TillMenu,
  latest: StoredOrder,
  cart: readonly CartLine[],
  handedOver: readonly HandedOverTicket[],
  at: number,
): LocalCommand[] {
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
    preBillPrinted: false,
  };
  const draft = saveDraftCommand(
    place,
    order,
    priced,
    { ...state, sent: latest.sent },
    at,
    latest.version,
  );
  let sent: readonly SentLineState[] = latest.sent;
  let version = state.version;
  const records = handedOver.map((ticket) => {
    const printed = ticket.lines.map((line) => ({
      lineId: line.lineId,
      sentQuantity: addQuantity(
        sent.find((entry) => entry.lineId === line.lineId)?.sentQuantity ?? quantity(0),
        quantity(line.quantity),
      ),
      sentNote: line.note,
    }));
    sent = withSent(sent, printed);
    const recorded = { order, priced, state: { ...state, version } };
    version += 1;
    return markSentCommand(
      place,
      recorded,
      { job: { jobId: ticket.ticketId }, ...ticket },
      sent,
      at,
    );
  });
  return [draft, ...records];
}

/** The redo of a draft with no ticket to record behind it. */
export const redoDraftCommand = (
  place: TillPlace,
  menu: TillMenu,
  latest: StoredOrder,
  cart: readonly CartLine[],
  at: number,
): LocalCommand => redoDraftCommands(place, menu, latest, cart, [], at)[0] as LocalCommand;
