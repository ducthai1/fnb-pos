import { DomainError } from "../errors";
import { type Quantity, negateQuantity } from "../money";
import type { Order, OrderLine } from "../order";
import { KITCHEN_ERROR_CODES } from "./kitchen-error-codes";
import type { SentLineState } from "./kitchen-ticket-types";

/** Only root items go to a station; toppings and picks go with them. */
export function isStationItem(line: OrderLine): boolean {
  return line.lineType === "item" && line.parentLineId === null;
}

/** Units a root item stands for at the station: a cancel line counts its units as positive. */
export function stationUnits(line: OrderLine): Quantity {
  return line.reversesLineId === null ? line.quantity : negateQuantity(line.quantity);
}

/**
 * The sent state by line id, refusing one that disagrees with the order. The domain never
 * leaves a line with fewer units than were sent (voidLine cancels sent units with a negative
 * line instead), so a state for a missing line, or with more units than the line, means the
 * kitchen layer and the order have drifted apart; guessing would either print a dish twice or
 * skip a cancel the station needs.
 */
export function indexSentState(
  order: Order,
  sentState: readonly SentLineState[],
): ReadonlyMap<string, SentLineState> {
  const items = new Map(order.lines.filter(isStationItem).map((line) => [line.id, line]));
  const byId = new Map<string, SentLineState>();
  for (const state of sentState) {
    if (byId.has(state.lineId)) {
      throw new DomainError(
        KITCHEN_ERROR_CODES.duplicateSentLine,
        `line ${state.lineId} has two sent states`,
        { lineId: state.lineId },
      );
    }
    const line = items.get(state.lineId);
    if (line === undefined) {
      throw new DomainError(
        KITCHEN_ERROR_CODES.sentLineNotFound,
        `sent line ${state.lineId} is not a root item of order ${order.id}`,
        { lineId: state.lineId, orderId: order.id },
      );
    }
    const units = stationUnits(line);
    if (state.sentQuantity < 0n || state.sentQuantity > units) {
      throw new DomainError(
        KITCHEN_ERROR_CODES.invalidSentQuantity,
        `line ${line.id} stands for ${units} thousandths at the station, not ${state.sentQuantity} sent`,
        { lineId: line.id, units, sentQuantity: state.sentQuantity },
      );
    }
    byId.set(state.lineId, state);
  }
  return byId;
}
