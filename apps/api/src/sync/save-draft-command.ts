import { assertLinesEditable, validateLineTree } from "@fnb/domain";
import {
  insertDraftHeader,
  lineIdsTakenElsewhere,
  replaceDraftLines,
  updateDraftHeader,
} from "./draft-order-writes";
import { priceDraftLines } from "./price-draft-lines";
import { readStoredOrder } from "./stored-order";
import type { SyncCommandContext } from "./sync-command-context";
import { CommandRejection, SYNC_ERROR_CODES } from "./sync-error-codes";
import type { SaveDraftPayload } from "./sync-request-schemas";

/**
 * order.save_draft: the till's whole draft (what was chosen, never what it costs), opened
 * or replaced. Any till of the branch may edit a draft (orders follow the table, not the
 * till); one of another branch may not touch it. Returns the order id.
 */
export async function saveDraft(context: SyncCommandContext, payload: SaveDraftPayload) {
  const { client, device, staffId, branch, command } = context;
  const existing = await readStoredOrder(client, payload.orderId, true);
  if (existing !== null && existing.branchId !== device.branchId) {
    throw new CommandRejection(SYNC_ERROR_CODES.orderIdTaken);
  }
  if (existing !== null) assertLinesEditable(existing.order);
  const lines = await priceDraftLines(
    client,
    branch,
    payload,
    Date.parse(command.createdAt),
    existing?.order.lines ?? [],
  );
  validateLineTree(lines, { refundOfOrderId: null });
  const itemIds = payload.lines.map((line) => line.lineId);
  if (await lineIdsTakenElsewhere(client, payload.orderId, itemIds)) {
    throw new CommandRejection(SYNC_ERROR_CODES.lineIdTaken);
  }
  if (existing === null) {
    if (!(await insertDraftHeader(client, device, payload, command.businessDate, staffId))) {
      throw new CommandRejection(SYNC_ERROR_CODES.deviceOrderNoTaken);
    }
  } else {
    await updateDraftHeader(client, payload);
  }
  await replaceDraftLines(client, device.tenantId, payload.orderId, lines, staffId);
  return payload.orderId;
}
