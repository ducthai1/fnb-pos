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
 *
 * The slip shows the version the till printed. When the order has moved on since (another
 * till added a round while this mark waited in a queue), the slip lacks it: the mark is
 * taken but marks nothing, so the table reads "changed after the pre-bill" and whoever
 * takes the money prints it again. A till that names no version marks the order as it is.
 */
async function markPreBillPrinted(context: SyncCommandContext, payload: MarkPreBillPrintedPayload) {
  const stored = await draftOfBranch(context, payload.orderId);
  const printed = payload.printedVersion;
  if (printed !== undefined && printed !== stored.order.version) return payload.orderId;
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
