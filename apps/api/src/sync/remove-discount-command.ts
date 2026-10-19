import { type RemoveDiscountPayload, removeDiscountPayloadSchema } from "@fnb/contracts";
import { validateLineTree } from "@fnb/domain";
import { touchOrder } from "./draft-order-writes";
import { draftOfBranch } from "./editable-order";
import { writeOrderLines } from "./order-line-writes";
import type { SyncCommandContext } from "./sync-command-context";
import { defineSyncCommand } from "./sync-command-definition";
import { CommandRejection, SYNC_ERROR_CODES } from "./sync-error-codes";

/**
 * order.remove_discount: takes discount lines off a draft. It only ever raises what the
 * customer pays, so it needs no permission; every id must be a discount line of the order.
 */
async function removeDiscount(context: SyncCommandContext, payload: RemoveDiscountPayload) {
  const { client, device, staffId } = context;
  const stored = await draftOfBranch(context, payload.orderId);
  const removed = new Set(payload.discountLineIds);
  for (const id of removed) {
    const line = stored.order.lines.find((candidate) => candidate.id === id);
    if (line?.lineType !== "discount") {
      throw new CommandRejection(SYNC_ERROR_CODES.discountLineNotFound);
    }
  }
  const after = stored.order.lines.filter((line) => !removed.has(line.id));
  validateLineTree(after, { refundOfOrderId: null });
  const write = { tenantId: device.tenantId, orderId: payload.orderId, staffId };
  await writeOrderLines(client, write, stored.order.lines, after);
  await touchOrder(client, payload.orderId);
  return payload.orderId;
}

export const removeDiscountCommand = defineSyncCommand(
  "order.remove_discount",
  removeDiscountPayloadSchema,
  removeDiscount,
);
