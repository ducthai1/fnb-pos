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
import type { TillMenu } from "../menu/till-menu";
import type { PrintJob } from "./printer-port";
import { PRINTER_KEYS, RECEIPT_PRINTER } from "./printer-profiles";
import { type SlipOrder, domainOrderOf, slipHead } from "./sale-order";

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
}

/**
 * Where an item is made: its product's station, and only a station of this branch (the
 * server knows no other). Null for an item nobody makes, which never goes on a ticket.
 */
export function stationRoutingOf(menu: TillMenu): StationRouting {
  return (line) => {
    const stationId =
      line.productId === null ? null : menu.productsById.get(line.productId)?.stationId;
    return stationId !== null && stationId !== undefined && menu.stations.has(stationId)
      ? stationId
      : null;
  };
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
  return tickets.map((ticket) => {
    const document = buildKitchenTicket({
      stationName: menu.stations.get(ticket.stationId)?.name ?? "",
      orderNumber: head.orderNumber,
      callNumber: head.callNumber,
      tableName: head.tableName,
      printedAt: head.printedAt,
      lines: ticket.lines.map((line) => ({
        kind: line.kind,
        name: line.name,
        quantity: line.quantity,
        note: line.note,
        previousNote: line.previousNote,
        children: line.children.map((child) => ({ name: child.name, quantity: child.quantity })),
      })),
    });
    const ids = new Set(ticket.lines.map((line) => line.lineId));
    return {
      job: {
        jobId: newId(),
        kind: "kitchen",
        printerKey: PRINTER_KEYS.station(ticket.stationId),
        preview: renderPreview(document, RECEIPT_PRINTER.paper),
        chunks: renderEscPosChunks(document, RECEIPT_PRINTER),
      },
      stationId: ticket.stationId,
      lines: ticket.lines.map((line) => ({
        lineId: line.lineId,
        kind: line.kind,
        quantity: quantityToDecimalString(line.quantity),
        note: line.note,
      })),
      sent: diff.sentState.filter((state) => ids.has(state.lineId)),
    };
  });
}
