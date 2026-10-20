import { type MarkPreBillPrintedPayload, markPreBillPrintedPayloadSchema } from "@fnb/contracts";
import { draftOfBranch } from "./editable-order";
import type { SyncCommandContext } from "./sync-command-context";
import { defineSyncCommand } from "./sync-command-definition";

/**
 * order.mark_pre_bill_printed: the till printed the draft's pre-bill. The order records
 * the version it was printed for (the one this change creates), and every other command
 * that changes the order raises the version past it, so "waiting to pay" ends by itself
 * when guests order more or a line is voided. Kept as its own command rather than read
 * from a print log: the server has no print log, and a till prints while offline.
 */
async function markPreBillPrinted(context: SyncCommandContext, payload: MarkPreBillPrintedPayload) {
  await draftOfBranch(context, payload.orderId);
  await context.client.query(
    "UPDATE sales_order SET pre_bill_printed_version = version + 1, version = version + 1, " +
      "updated_at = now() WHERE id = $1",
    [payload.orderId],
  );
  return payload.orderId;
}

export const markPreBillPrintedCommand = defineSyncCommand(
  "order.mark_pre_bill_printed",
  markPreBillPrintedPayloadSchema,
  markPreBillPrinted,
);
