import type { MarkSentToKitchenPayload, SentTicketLine } from "@fnb/contracts";
import { newId } from "@fnb/db";
import { type KitchenTicketLine, quantityToDecimalString } from "@fnb/domain";
import { KITCHEN_SYNC_ERROR_CODES as K } from "./kitchen-sync-error-codes";
import type { LineSentState } from "./kitchen-owed-lines";
import type { SyncCommandContext } from "./sync-command-context";
import { CommandRejection } from "./sync-error-codes";

/** The item and its toppings as the server held them when the station was told. */
function detailOf(due: KitchenTicketLine) {
  return {
    name: due.name,
    previousNote: due.previousNote,
    children: due.children.map((child) => ({
      name: child.name,
      quantity: quantityToDecimalString(child.quantity),
      note: child.note,
      depth: child.depth,
    })),
  };
}

/** A reported ticket line, with the station it printed at and the owed line it stands for. */
export interface PrintedTicketLine {
  readonly stationId: string;
  readonly line: SentTicketLine;
  readonly due: KitchenTicketLine;
}

/**
 * Stores the ticket and its lines (append-only) and moves each line's sent state on. An id
 * taken by any ticket, even one of another tenant this one cannot see, is refused by the
 * primary key without letting the till learn anything about that ticket.
 */
export async function recordKitchenTicket(
  context: SyncCommandContext,
  payload: MarkSentToKitchenPayload,
  printed: readonly PrintedTicketLine[],
  sentState: readonly LineSentState[],
) {
  const { client, device, staffId, command } = context;
  const inserted = await client.query(
    "INSERT INTO kitchen_ticket (id, tenant_id, order_id, device_id, staff_id, command_id, " +
      "payload) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING",
    [
      payload.ticketId,
      device.tenantId,
      payload.orderId,
      device.deviceId,
      staffId,
      command.commandId,
      JSON.stringify(command.payload),
    ],
  );
  if (inserted.rowCount !== 1) throw new CommandRejection(K.ticketIdTaken);
  for (const { stationId, line, due } of printed) {
    await client.query(
      "INSERT INTO kitchen_ticket_line (id, tenant_id, ticket_id, order_id, line_id, " +
        "station_id, kind, quantity, note, detail) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
      [
        newId(),
        device.tenantId,
        payload.ticketId,
        payload.orderId,
        line.lineId,
        stationId,
        line.kind,
        quantityToDecimalString(line.quantity),
        line.note,
        JSON.stringify(detailOf(due)),
      ],
    );
  }
  for (const state of sentState) {
    await client.query(
      "UPDATE sales_order_line SET sent_quantity = $2, sent_note = $3, version = version + 1, " +
        "updated_at = now() WHERE id = $1",
      [state.lineId, quantityToDecimalString(state.sentQuantity), state.sentNote],
    );
  }
}
