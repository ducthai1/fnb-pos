import { DomainError } from "../errors";
import { type Quantity, quantity, subtractQuantity } from "../money";
import {
  type Order,
  type OrderLine,
  reversedQuantityOf,
  subtreeOf,
  validateLineTree,
} from "../order";
import { indexSentState, isStationItem, stationUnits } from "./index-sent-state";
import { KITCHEN_ERROR_CODES } from "./kitchen-error-codes";
import type {
  KitchenTicket,
  KitchenTicketChild,
  KitchenTicketDiff,
  KitchenTicketLine,
  SentLineState,
  StationRouting,
} from "./kitchen-ticket-types";

/** Toppings and combo picks under an item, with their depth; discounts are not the station's. */
function childrenForStation(lines: readonly OrderLine[], item: OrderLine): KitchenTicketChild[] {
  const byId = new Map(lines.map((line) => [line.id, line]));
  const depthOf = (line: OrderLine): number => {
    const parent = line.parentLineId === null ? undefined : byId.get(line.parentLineId);
    return parent === undefined || parent.id === item.id ? 1 : depthOf(parent) + 1;
  };
  return subtreeOf(lines, item.id)
    .filter((line) => line.id !== item.id && line.lineType !== "discount")
    .map((line) => ({
      lineId: line.id,
      lineType: line.lineType,
      name: line.nameSnapshot,
      quantity: line.quantity,
      note: line.note,
      depth: depthOf(line),
    }));
}

function ticketLine(
  order: Order,
  line: OrderLine,
  kind: KitchenTicketLine["kind"],
  quantity: Quantity,
  previousNote: string | null,
): KitchenTicketLine {
  return {
    kind,
    lineId: line.id,
    cancelsLineId: line.reversesLineId,
    name: line.nameSnapshot,
    quantity,
    note: line.note,
    previousNote,
    children: childrenForStation(order.lines, line),
  };
}

/** What one root item adds to its station's ticket since `sent`. */
function changesOf(
  order: Order,
  line: OrderLine,
  sent: SentLineState | undefined,
): KitchenTicketLine[] {
  const sentUnits = sent?.sentQuantity ?? quantity(0);
  const unsent = subtractQuantity(stationUnits(line), sentUnits);
  const isCancel = line.reversesLineId !== null;
  const changes: KitchenTicketLine[] = [];
  if (unsent > 0n) changes.push(ticketLine(order, line, isCancel ? "cancel" : "new", unsent, null));
  if (isCancel || sent === undefined || sent.sentNote === line.note) return changes;
  // Only the units the station still has to make need the new note; cancelled ones are gone.
  const stillToMake = subtractQuantity(sentUnits, reversedQuantityOf(order.lines, line.id));
  if (stillToMake > 0n) {
    changes.push(ticketLine(order, line, "note_changed", stillToMake, sent.sentNote));
  }
  return changes;
}

/**
 * What each station must be told about an order since the tickets it already has: units not
 * sent yet, cancels of units it was sent (the negative lines voidLine makes, routed to the
 * station of the line they cancel) and notes changed on units it has. Toppings and combo
 * picks print under their item and go where it goes; an item routed to no station prints
 * nowhere and is not recorded as sent, so a void of it needs no cancel ticket.
 *
 * Pure: it neither prints nor records. The caller prints the tickets, and only once the printer
 * has taken them stores `sentState`; on a failed print it keeps the old state, so the next
 * send prints the same changes again instead of losing them.
 */
export function diffKitchenTicket(
  order: Order,
  sentState: readonly SentLineState[],
  routing: StationRouting,
): KitchenTicketDiff {
  if (order.refundOfOrderId !== null) {
    throw new DomainError(
      KITCHEN_ERROR_CODES.refundOrder,
      `order ${order.id} is a refund: the goods were made and paid for, nothing goes to a station`,
      { orderId: order.id },
    );
  }
  validateLineTree(order.lines);
  const sent = indexSentState(order, sentState);
  const byId = new Map(order.lines.map((line) => [line.id, line]));
  const tickets = new Map<string, KitchenTicketLine[]>();
  const next: SentLineState[] = [];
  for (const line of order.lines.filter(isStationItem)) {
    const previous = sent.get(line.id);
    const routed = line.reversesLineId === null ? line : (byId.get(line.reversesLineId) ?? line);
    const station = routing(routed);
    if (station === null) {
      if (previous !== undefined) next.push(previous);
      continue;
    }
    const changes = changesOf(order, line, previous);
    if (changes.length > 0) tickets.set(station, [...(tickets.get(station) ?? []), ...changes]);
    next.push({ lineId: line.id, sentQuantity: stationUnits(line), sentNote: line.note });
  }
  const printed: KitchenTicket[] = [...tickets].map(([stationId, lines]) => ({ stationId, lines }));
  return { tickets: printed, sentState: next };
}
