import {
  SYNC_ORDER_VERSION_ERROR_CODES,
  type SaveDraftPayload,
  saveDraftPayloadSchema,
} from "@fnb/contracts";
import { type OrderLine, assertLinesEditable, validateLineTree } from "@fnb/domain";
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
 * paid or cancelled; a second order opened there is refused. A draft naming the version
 * it was edited from is saved only over that version. Returns the order id.
 */
async function saveDraft(context: SyncCommandContext, payload: SaveDraftPayload) {
  const { client, device, staffId, branch, time } = context;
  const existing = await readStoredOrder(client, payload.orderId, true);
  if (existing !== null && existing.branchId !== device.branchId) {
    throw new CommandRejection(SYNC_ERROR_CODES.orderIdTaken);
  }
  // Checked on the locked row, so of two tills saving over one version only the first does.
  const expected = payload.expectedVersion;
  if (expected !== undefined && expected !== (existing?.order.version ?? 0)) {
    throw new CommandRejection(SYNC_ORDER_VERSION_ERROR_CODES.orderVersionStale);
  }
  if (existing !== null) assertLinesEditable(existing.order);
  if (existing !== null && existing.tableId !== payload.tableId) {
    throw new CommandRejection(TABLE_SYNC_ERROR_CODES.tableChangeNeedsTransfer);
  }
  // Prices of the hour and what is sold out follow the server's reading of when the till
  // recorded the draft: a till whose clock is set to happy hour does not get its prices.
  const recordedAt = time.effectiveAt;
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
  await requireTypedPrices(context, payload, newlyTypedPrices(before, lines));
  if (existing === null) {
    const { chargeProfile } = await readDeviceOrderSettings(client, device.deviceId);
    const table =
      payload.tableId === null
        ? null
        : await seatableTable(client, device.branchId, payload.tableId);
    const header = [
      device,
      payload,
      time.businessDate,
      staffId,
      chargeProfile,
      table,
      time.effectiveAt,
    ] as const;
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

/**
 * Each price typed anew needs the staff member's own open_price, or a manager's approval of
 * exactly that price on that line of this order: the line's own approval, or the draft's
 * for a line naming none. An approval is used once, so one approval never covers two lines.
 */
async function requireTypedPrices(
  context: SyncCommandContext,
  payload: SaveDraftPayload,
  typed: readonly OrderLine[],
) {
  const intents = new Map(payload.lines.map((line) => [line.lineId, line]));
  for (const line of typed) {
    const approvalId = intents.get(line.id)?.priceApprovalId ?? payload.approvalId;
    const action = {
      key: "open_price",
      enteredPrice: line.unitPrice,
      subject: { orderId: payload.orderId, lineId: line.id },
    } as const;
    await requirePermission(context, action, approvalId);
  }
}

export const saveDraftCommand = defineSyncCommand(
  "order.save_draft",
  saveDraftPayloadSchema,
  saveDraft,
);
