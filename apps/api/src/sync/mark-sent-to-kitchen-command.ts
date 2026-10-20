import { type MarkSentToKitchenPayload, markSentToKitchenPayloadSchema } from "@fnb/contracts";
import type { OrderStatus } from "@fnb/domain";
import { touchOrder } from "./draft-order-writes";
import { orderOfBranch } from "./editable-order";
import { owedLineOf, owedTicketLines, sentStateAfter } from "./kitchen-owed-lines";
import { KITCHEN_SYNC_ERROR_CODES as K } from "./kitchen-sync-error-codes";
import { type PrintedTicketLine, recordKitchenTicket } from "./kitchen-ticket-writes";
import type { SyncCommandContext } from "./sync-command-context";
import { defineSyncCommand } from "./sync-command-definition";
import { CommandRejection } from "./sync-error-codes";

/**
 * A paid order still goes to the kitchen: a counter that takes the money first prints the
 * drinks for the bar after the payment, and the bar must not be told about them twice. A
 * posted order's books are locked, and a cancelled one has nothing left to make (it could
 * only be cancelled once nothing sent was still standing).
 */
const SENDABLE: ReadonlySet<OrderStatus> = new Set(["draft", "paid"]);

async function stationsOfBranch(context: SyncCommandContext, payload: MarkSentToKitchenPayload) {
  const ids = [...new Set(payload.stations.map((station) => station.stationId))];
  const { rows } = await context.client.query(
    "SELECT id FROM station WHERE id = ANY($1::uuid[]) AND branch_id = $2",
    [ids, context.device.branchId],
  );
  if (rows.length !== ids.length) throw new CommandRejection(K.stationNotFound);
}

/**
 * order.mark_sent_to_kitchen: records a ticket the till printed, once the printer took it.
 * The server works out again, with the domain's diffKitchenTicket, what the order owes the
 * stations since what was recorded, and takes the ticket only when every line of it is
 * within that: a till never records more as made than the order holds. Returns the order id.
 */
async function markSentToKitchen(context: SyncCommandContext, payload: MarkSentToKitchenPayload) {
  const stored = await orderOfBranch(context, payload.orderId);
  if (!SENDABLE.has(stored.order.status)) throw new CommandRejection(K.orderClosed);
  await stationsOfBranch(context, payload);
  const owed = owedTicketLines(stored);
  const printed: PrintedTicketLine[] = payload.stations.flatMap(({ stationId, lines }) =>
    lines.map((line) => ({ stationId, line, due: owedLineOf(owed, line) })),
  );
  const reported = printed.map(({ line }) => line);
  await recordKitchenTicket(context, payload, printed, sentStateAfter(stored, reported));
  // Paid orders too: a till keeps a server copy only when its version is newer, so the
  // tills learn the new sent state (and stop printing these dishes) only through it.
  await touchOrder(context.client, stored.order.id);
  return stored.order.id;
}

export const markSentToKitchenCommand = defineSyncCommand(
  "order.mark_sent_to_kitchen",
  markSentToKitchenPayloadSchema,
  markSentToKitchen,
);
