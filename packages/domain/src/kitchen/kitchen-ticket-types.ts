import type { Quantity } from "../money";
import type { OrderLine, OrderLineType } from "../order";

/**
 * What the stations have been shown of one root item line. For an ordinary line, the units
 * printed so far, counting units later cancelled (what voidLine calls sentQuantity); for a
 * cancel line (a negative item), the units printed on cancel tickets. Never negative.
 */
export interface SentLineState {
  readonly lineId: string;
  readonly sentQuantity: Quantity;
  /** The note as last printed, so a changed note goes out again. */
  readonly sentNote: string | null;
}

/**
 * The station that makes a line (bar, kitchen), or null when nobody makes it (bottled water).
 * Asked about root items and about the picks of a combo, each of which has its own product.
 */
export type StationRouting = (line: OrderLine) => string | null;

/**
 * - `new`: units the station has not seen yet
 * - `cancel`: units it was sent that are now cancelled: stop making them
 * - `note_changed`: units it already has, whose note has changed since
 */
export type KitchenTicketLineKind = "new" | "cancel" | "note_changed";

/** A topping or combo pick printed under its item, per one unit of it. */
export interface KitchenTicketChild {
  readonly lineId: string;
  readonly lineType: OrderLineType;
  readonly name: string;
  readonly quantity: Quantity;
  readonly note: string | null;
  /** 1 under the item, 2 under a combo pick. */
  readonly depth: number;
}

export interface KitchenTicketLine {
  readonly kind: KitchenTicketLineKind;
  /** The order line printed: for a cancel, the negative line, whose id the ticket goes out under. */
  readonly lineId: string;
  /** For a cancel, the line whose units it takes back; otherwise null. */
  readonly cancelsLineId: string | null;
  readonly name: string;
  /** Always positive: units to make, to stop making, or whose note changed. */
  readonly quantity: Quantity;
  readonly note: string | null;
  /** For `note_changed`, the note the station last saw; otherwise null. */
  readonly previousNote: string | null;
  readonly children: readonly KitchenTicketChild[];
}

export interface KitchenTicket {
  readonly stationId: string;
  readonly lines: readonly KitchenTicketLine[];
}

export interface KitchenTicketDiff {
  /** One per station with something to print, in the order the stations first appear. */
  readonly tickets: readonly KitchenTicket[];
  /**
   * The sent state once these tickets are printed. Store it only AFTER the printer has taken
   * them: a ticket lost to a jammed or offline printer must come out again on the next send,
   * and recording it as sent first would leave the order made without it, silently. A combo
   * made at two stations is on both tickets under one line, with one sent state: store it
   * once every ticket it is on has printed, or the station whose ticket was lost never gets
   * its part.
   */
  readonly sentState: readonly SentLineState[];
}
