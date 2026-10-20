import { type SaveDraftPayload, saveDraftPayloadSchema } from "@fnb/contracts";
import { assertLinesEditable, validateLineTree } from "@fnb/domain";
import { readDeviceOrderSettings } from "./device-order-settings";
import { itemsAdding, newlyTypedPrices, refuseSoldOut } from "./draft-additions";
import { refuseRaisedOrderDiscount } from "./draft-discount-guard";
import { mergeDraftLines, readVoidedLineIds } from "./draft-line-locks";
import { insertDraftHeader, lineIdsTakenElsewhere, updateDraftHeader } from "./draft-order-writes";
import { writeOrderLines } from "./order-line-writes";
import { priceDraftLines } from "./price-draft-lines";
import { requirePermission } from "./staff-permission-check";
import { readStoredOrder } from "./stored-order";
import type { SyncCommandContext } from "./sync-command-context";
import { defineSyncCommand } from "./sync-command-definition";
import { CommandRejection, SYNC_ERROR_CODES } from "./sync-error-codes";
import { seatableTable, seatingAtTable } from "./table-seating";
import { TABLE_SYNC_ERROR_CODES } from "./table-sync-error-codes";

/**
 * order.save_draft: the till's whole draft (what was chosen, never what it costs), opened
 * or saved again. Any till of the branch may edit a draft (orders follow the table, not the
 * till); one of another branch may not touch it. Lines are kept by id, so what cancel lines,
 * void records and the kitchen point at stays put. A draft opened at a table holds it until
 * paid or cancelled; a second order opened there is refused. Returns the order id.
 */
async function saveDraft(context: SyncCommandContext, payload: SaveDraftPayload) {
  const { client, device, staffId, branch, command } = context;
  const existing = await readStoredOrder(client, payload.orderId, true);
  if (existing !== null && existing.branchId !== device.branchId) {
    throw new CommandRejection(SYNC_ERROR_CODES.orderIdTaken);
  }
  if (existing !== null) assertLinesEditable(existing.order);
  if (existing !== null && existing.tableId !== payload.tableId) {
    throw new CommandRejection(TABLE_SYNC_ERROR_CODES.tableChangeNeedsTransfer);
  }
  const recordedAt = new Date(command.createdAt);
  const before = existing?.order.lines ?? [];
  const fresh = await priceDraftLines(client, branch, payload, recordedAt.getTime(), before);
  const lines = mergeDraftLines(before, fresh, {
    sentQuantityByLineId: existing?.sentQuantityByLineId ?? new Map(),
    voidedLineIds: await readVoidedLineIds(client, payload.orderId),
  });
  validateLineTree(lines, { refundOfOrderId: null });
  await refuseRaisedOrderDiscount(context, before, lines);
  const itemIds = payload.lines.map((line) => line.lineId);
  if (await lineIdsTakenElsewhere(client, payload.orderId, itemIds)) {
    throw new CommandRejection(SYNC_ERROR_CODES.lineIdTaken);
  }
  const adding = itemsAdding(before, lines);
  await refuseSoldOut(client, device.branchId, payload.channelKey, adding, recordedAt);
  if (newlyTypedPrices(before, lines).length > 0) {
    await requirePermission(context, { key: "open_price" }, payload.approvalId);
  }
  if (existing === null) {
    const { chargeProfile } = await readDeviceOrderSettings(client, device.deviceId);
    const table =
      payload.tableId === null
        ? null
        : await seatableTable(client, device.branchId, payload.tableId);
    const header = [device, payload, command.businessDate, staffId, chargeProfile, table] as const;
    if (!(await seatingAtTable(() => insertDraftHeader(client, ...header)))) {
      throw new CommandRejection(SYNC_ERROR_CODES.deviceOrderNoTaken);
    }
  } else {
    await updateDraftHeader(client, payload);
  }
  const write = { tenantId: device.tenantId, orderId: payload.orderId, staffId };
  await writeOrderLines(client, write, before, lines);
  return payload.orderId;
}

export const saveDraftCommand = defineSyncCommand(
  "order.save_draft",
  saveDraftPayloadSchema,
  saveDraft,
);
