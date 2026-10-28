import { type TransferTablePayload, transferTablePayloadSchema } from "@fnb/contracts";
import { draftOfBranch } from "./editable-order";
import { requirePermission } from "./staff-permission-check";
import type { SyncCommandContext } from "./sync-command-context";
import { defineSyncCommand } from "./sync-command-definition";
import { CommandRejection } from "./sync-error-codes";
import { seatableTable, seatingAtTable } from "./table-seating";
import { TABLE_SYNC_ERROR_CODES } from "./table-sync-error-codes";

/**
 * table.transfer: moves the guests of a draft to a free table of the branch. Only the
 * order's table changes; its lines, and what the kitchen already has of each, stay as they
 * are, so the next send prints only what is new. A table already holding an order is
 * refused: that would merge two bills, which is a separate action. A manager's approval of
 * the move is for this order only.
 */
async function transferTable(context: SyncCommandContext, payload: TransferTablePayload) {
  const stored = await draftOfBranch(context, payload.orderId);
  if (stored.tableId === null) throw new CommandRejection(TABLE_SYNC_ERROR_CODES.orderNotAtTable);
  if (stored.tableId === payload.toTableId) {
    throw new CommandRejection(TABLE_SYNC_ERROR_CODES.tableOccupied);
  }
  // A manager approves moving these guests, so the approval moves this order and no other.
  const action = { key: "transfer_table", subject: { orderId: stored.order.id } } as const;
  await requirePermission(context, action, payload.approvalId);
  const table = await seatableTable(context.client, context.device.branchId, payload.toTableId);
  await seatingAtTable(() =>
    context.client.query(
      "UPDATE sales_order SET table_id = $2, table_name_snapshot = $3, " +
        // Moving changes no amount, so a pre-bill current before the move stays current.
        "pre_bill_printed_version = CASE WHEN pre_bill_printed_version = version " +
        "THEN version + 1 ELSE pre_bill_printed_version END, " +
        "version = version + 1, updated_at = now() WHERE id = $1",
      [payload.orderId, table.id, table.name],
    ),
  );
  return payload.orderId;
}

export const transferTableCommand = defineSyncCommand(
  "table.transfer",
  transferTablePayloadSchema,
  transferTable,
);
