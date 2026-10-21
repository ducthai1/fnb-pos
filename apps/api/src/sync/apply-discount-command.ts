import { type ApplyDiscountPayload, applyDiscountPayloadSchema } from "@fnb/contracts";
import {
  type DiscountScope,
  buildLineDiscount,
  buildOrderDiscountLines,
  projectedDiscountRate,
  validateLineTree,
} from "@fnb/domain";
import { lineIdsTakenElsewhere, touchOrder } from "./draft-order-writes";
import { draftOfBranch } from "./editable-order";
import { writeOrderLines } from "./order-line-writes";
import { requirePermission } from "./staff-permission-check";
import type { SyncCommandContext } from "./sync-command-context";
import { defineSyncCommand } from "./sync-command-definition";
import { CommandRejection, SYNC_ERROR_CODES } from "./sync-error-codes";

/**
 * order.apply_discount: a discount on the whole order or on one sold item, built by the
 * domain on the order the server holds. It is judged by the share of the scope all its
 * discounts take off once this one is added, so a cap cannot be passed in small steps;
 * past the staff member's cap it needs a manager's approval of up to that share, given for
 * this order (and item).
 */
async function applyDiscount(context: SyncCommandContext, payload: ApplyDiscountPayload) {
  const { client, device, staffId } = context;
  const stored = await draftOfBranch(context, payload.orderId);
  const ids = [...payload.discountLineIds];
  const nextId = () => {
    const id = ids.shift();
    if (id === undefined) throw new CommandRejection(SYNC_ERROR_CODES.discountLineIdsTooFew);
    return id;
  };
  const scope: DiscountScope =
    payload.scope === "order" ? { kind: "order" } : { kind: "line", lineId: payload.lineId };
  const lines =
    payload.scope === "order"
      ? buildOrderDiscountLines(stored.order, payload.discount, nextId)
      : buildLineDiscount(stored.order, payload.lineId, payload.discount, nextId);
  const discountRate = projectedDiscountRate(stored.order, lines, scope);
  const key = payload.scope === "order" ? "order_discount" : "line_discount";
  const subject =
    payload.scope === "order"
      ? { orderId: payload.orderId }
      : { orderId: payload.orderId, lineId: payload.lineId };
  await requirePermission(context, { key, discountRate, subject }, payload.approvalId);
  const after = [...stored.order.lines, ...lines];
  validateLineTree(after, { refundOfOrderId: null });
  const newIds = lines.map((line) => line.id);
  if (await lineIdsTakenElsewhere(client, payload.orderId, newIds)) {
    throw new CommandRejection(SYNC_ERROR_CODES.lineIdTaken);
  }
  const write = { tenantId: device.tenantId, orderId: payload.orderId, staffId };
  await writeOrderLines(client, write, stored.order.lines, after);
  await touchOrder(client, payload.orderId);
  return payload.orderId;
}

export const applyDiscountCommand = defineSyncCommand(
  "order.apply_discount",
  applyDiscountPayloadSchema,
  applyDiscount,
);
