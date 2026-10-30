import type { SentTicketLine } from "@fnb/contracts";
import {
  type KitchenTicketLine,
  type SentLineState,
  type StationRouting,
  diffKitchenTicket,
  quantityToDecimalString,
} from "@fnb/domain";
import { buildKitchenTicket, renderEscPosChunks, renderPreview } from "@fnb/printing";
import { newId } from "../ids/new-id";
import { vi } from "../../messages/vi";
import type { TillMenu } from "../menu/till-menu";
import type { PrintJob } from "./printer-port";
import { PRINTER_KEYS, RECEIPT_PRINTER } from "./printer-profiles";
import { type SlipOrder, domainOrderOf, slipHead } from "./sale-order";
import { weighedOnSlip } from "./weighed-print";

/** The product of the item a ticket line is about, from the order's own lines. */
const productIdOf = (sale: SlipOrder, lineId: string): string | null =>
  sale.priced.lines.find((line) => line.id === lineId)?.productId ?? null;

/** A station's ticket as order.mark_sent_to_kitchen reports it once printed. */
export interface KitchenTicketJob {
  readonly job: PrintJob;
  readonly stationId: string;
  /** The wire form: quantities as decimal strings. */
  readonly lines: readonly {
    lineId: string;
    kind: SentTicketLine["kind"];
    quantity: string;
    note: string | null;
  }[];
  /** The sent state of this ticket's lines once it is printed. */
  readonly sent: readonly SentLineState[];
  /**
   * A combo made at several stations is on each of their tickets, and reported (in `lines`
   * and `sent`) by the last of them only: by line id, the jobs of its earlier parts, which
   * must all have printed too (see recordablePart).
   */
  readonly earlierParts: ReadonlyMap<string, readonly string[]>;
}

/**
 * What a printed ticket may record as sent, given the jobs of the same send that did not
 * print: a combo whose part for another station was lost stays owed, so the next send prints
 * it again at every station (a second ticket at the bar beats no food from the kitchen).
 * Null when nothing of the ticket is left to record.
 */
export function recordablePart(
  ticket: KitchenTicketJob,
  unprinted: ReadonlySet<string>,
): KitchenTicketJob | null {
  const complete = (lineId: string) =>
    (ticket.earlierParts.get(lineId) ?? []).every((jobId) => !unprinted.has(jobId));
  const lines = ticket.lines.filter((line) => complete(line.lineId));
  if (lines.length === 0) return null;
  return { ...ticket, lines, sent: ticket.sent.filter((state) => complete(state.lineId)) };
}

/**
 * Where an item is made: its product's station, and only a station of this branch (the
 * server knows no other). Null for an item nobody makes, which never goes on a ticket.
 */
export function stationRoutingOf(menu: TillMenu): StationRouting {
  const common = menu.config.flags.kitchen_routing === true ? null : commonStationOf(menu);
  return (line) => {
    const stationId =
      line.productId === null ? null : menu.productsById.get(line.productId)?.stationId;
    if (stationId === null || stationId === undefined || !menu.stations.has(stationId)) return null;
    // Routing off: whatever someone makes goes on the one shared slip.
    return common ?? stationId;
  };
}

/**
 * The station whose printer takes the shared slip when tickets are not split by station: the
 * first of the branch by name, then by id, so every till of the branch picks the same one.
 */
export function commonStationOf(menu: TillMenu): string | null {
  const stations = [...menu.stations.values()].sort(
    (a, b) => a.name.localeCompare(b.name, "vi") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return stations[0]?.id ?? null;
}

/**
 * The bar and kitchen tickets the order owes, by the domain's diff since what the stations
 * were already sent: nothing for a counter order (it goes to the bar once paid), the earlier
 * rounds for a table's order, so a ticket only ever carries what is new.
 */
export function kitchenSlips(
  menu: TillMenu,
  sale: SlipOrder,
  at: number,
  /** Only these lines of what is owed: a void prints its cancel and nothing else. */
  only: (line: KitchenTicketLine) => boolean = () => true,
): KitchenTicketJob[] {
  const diff = diffKitchenTicket(domainOrderOf(sale), sale.sent ?? [], stationRoutingOf(menu));
  const head = slipHead(menu, sale, at);
  const tickets = diff.tickets
    .map((ticket) => ({ ...ticket, lines: ticket.lines.filter(only) }))
    .filter((ticket) => ticket.lines.length > 0);
  const jobIds = tickets.map(() => newId());
  const ticketsOfLine = new Map<string, number[]>();
  tickets.forEach((ticket, index) => {
    for (const line of ticket.lines) {
      ticketsOfLine.set(line.lineId, [...(ticketsOfLine.get(line.lineId) ?? []), index]);
    }
  });
  return tickets.map((ticket, index) => {
    const parts = (lineId: string) => ticketsOfLine.get(lineId) ?? [index];
    const reported = ticket.lines.filter((line) => parts(line.lineId).at(-1) === index);
    const earlierParts = new Map(
      reported.flatMap((line) => {
        const before = parts(line.lineId).filter((other) => other !== index);
        return before.length === 0
          ? []
          : [[line.lineId, before.map((other) => jobIds[other] ?? "")]];
      }),
    );
    const document = buildKitchenTicket({
      stationName:
        menu.config.flags.kitchen_routing === true
          ? (menu.stations.get(ticket.stationId)?.name ?? "")
          : vi.kitchen.commonSlip,
      orderNumber: head.orderNumber,
      callNumber: head.callNumber,
      tableName: head.tableName,
      printedAt: head.printedAt,
      lines: ticket.lines.map((line) => ({
        kind: line.kind,
        name: line.name,
        quantity: line.quantity,
        grams: weighedOnSlip(menu, productIdOf(sale, line.lineId), line.quantity)?.grams ?? null,
        note: line.note,
        previousNote: line.previousNote,
        children: line.children.map((child) => ({
          name: child.name,
          quantity: child.quantity,
          depth: child.depth,
        })),
      })),
    });
    const ids = new Set(reported.map((line) => line.lineId));
    return {
      job: {
        jobId: jobIds[index] ?? newId(),
        kind: "kitchen",
        printerKey: PRINTER_KEYS.station(ticket.stationId),
        preview: renderPreview(document, RECEIPT_PRINTER.paper),
        chunks: renderEscPosChunks(document, RECEIPT_PRINTER),
      },
      stationId: ticket.stationId,
      lines: reported.map((line) => ({
        lineId: line.lineId,
        kind: line.kind,
        quantity: quantityToDecimalString(line.quantity),
        note: line.note,
      })),
      sent: diff.sentState.filter((state) => ids.has(state.lineId)),
      earlierParts,
    };
  });
}
