import type { SentTicketLine } from "@fnb/contracts";
import {
  type KitchenTicketLine,
  type Quantity,
  type SentLineState,
  addQuantity,
  diffKitchenTicket,
  quantity,
} from "@fnb/domain";
import { KITCHEN_SYNC_ERROR_CODES as K } from "./kitchen-sync-error-codes";
import type { StoredOrder } from "./stored-order";
import { CommandRejection } from "./sync-error-codes";

/**
 * Every item counts as routed: the server checks how many units are owed, while where a
 * ticket printed is the till's fact (its menu routed it), recorded as reported. A menu
 * that moved a product to another station while the ticket was in flight must not turn a
 * printed ticket into a refusal that prints it again.
 */
const ANY_STATION = () => "stations";

/** What the stations have been shown of the order, as the server recorded it. */
function sentStateOf(stored: StoredOrder): SentLineState[] {
  return stored.order.lines.flatMap((line) => {
    const sentQuantity = stored.sentQuantityByLineId.get(line.id) ?? quantity(0);
    if (sentQuantity === 0n) return [];
    return [
      { lineId: line.id, sentQuantity, sentNote: stored.sentNoteByLineId.get(line.id) ?? null },
    ];
  });
}

const keyOf = (line: { lineId: string; kind: string }) => `${line.lineId}:${line.kind}`;

/**
 * What the order owes the stations now, by line and kind, recomputed by the domain from
 * the recorded sent state. A refund is refused there, with the domain's code.
 */
export function owedTicketLines(stored: StoredOrder): ReadonlyMap<string, KitchenTicketLine> {
  const { tickets } = diffKitchenTicket(stored.order, sentStateOf(stored), ANY_STATION);
  return new Map(tickets.flatMap((ticket) => ticket.lines).map((line) => [keyOf(line), line]));
}

/**
 * The owed line each reported line stands for. A ticket may carry less than is owed (the
 * order grew on another till after this one printed), never a line or a unit more.
 */
export function owedLineOf(
  owed: ReadonlyMap<string, KitchenTicketLine>,
  reported: SentTicketLine,
): KitchenTicketLine {
  const due = owed.get(keyOf(reported));
  if (due === undefined || reported.quantity > due.quantity) throw new CommandRejection(K.notOwed);
  return due;
}

export interface LineSentState {
  readonly lineId: string;
  readonly sentQuantity: Quantity;
  readonly sentNote: string | null;
}

/**
 * Each reported line's sent state once the ticket is recorded. New and cancelled units add
 * to what was sent. The note becomes the one printed when the ticket says the note changed,
 * or when these are the line's first units sent; otherwise it stays, so a note change the
 * ticket did not carry is still owed to the units the stations already have.
 */
export function sentStateAfter(stored: StoredOrder, reported: readonly SentTicketLine[]) {
  const byLine = new Map<string, SentTicketLine[]>();
  for (const line of reported) byLine.set(line.lineId, [...(byLine.get(line.lineId) ?? []), line]);
  return [...byLine].map(([lineId, lines]): LineSentState => {
    const before = stored.sentQuantityByLineId.get(lineId) ?? quantity(0);
    const units = lines.filter((line) => line.kind !== "note_changed");
    const noteChanged = lines.find((line) => line.kind === "note_changed");
    const firstSent = before === 0n ? units[0] : undefined;
    return {
      lineId,
      sentQuantity: addQuantity(before, ...units.map((line) => line.quantity)),
      sentNote: (noteChanged ?? firstSent)?.note ?? stored.sentNoteByLineId.get(lineId) ?? null,
    };
  });
}
