import { type VoidLinePayload, voidLinePayloadSchema } from "@fnb/contracts";
import { newId } from "@fnb/db";
import {
  type VoidLineRequest,
  authorize,
  quantity,
  quantityToDecimalString,
  voidLine,
} from "@fnb/domain";
import { approvalIdOf, redeemApproval } from "./approval-redemption";
import { readDeviceOrderSettings } from "./device-order-settings";
import { touchOrder } from "./draft-order-writes";
import { draftOfBranch } from "./editable-order";
import { writeOrderLines } from "./order-line-writes";
import { grantsOfStaff } from "./staff-permission-check";
import type { SyncCommandContext } from "./sync-command-context";
import { defineSyncCommand } from "./sync-command-definition";

/**
 * order.void_line: cancels units of a sold item on a draft, through the domain's voidLine
 * on the order the server holds; the cancel line, if any, is built here, never taken from
 * the till. Units the kitchen has are taken last and, where the branch asks for it, need
 * an approver unless the staff member may cancel them alone. Returns the order id.
 */
async function voidOrderLine(context: SyncCommandContext, payload: VoidLinePayload) {
  const { client, device, staffId } = context;
  const stored = await draftOfBranch(context, payload.orderId);
  const request = (approvedByStaffId: string | null, needsApprover: boolean): VoidLineRequest => ({
    lineId: payload.lineId,
    quantity: payload.quantity,
    reasonCode: payload.reasonCode,
    staffId,
    approvedByStaffId,
    sentQuantity: stored.sentQuantityByLineId.get(payload.lineId) ?? quantity(0),
    newLineId: newId,
    requireApprovalAfterSent: needsApprover,
  });
  // The domain decides which units the kitchen has; only then is it known who must agree.
  const planned = voidLine(stored.order, request(null, false)).record;
  const settings = await readDeviceOrderSettings(client, device.deviceId);
  const needsApprover =
    planned.fromSent > 0n &&
    settings.voidAfterSentNeedsApproval &&
    authorize({ key: "void_after_sent" }, await grantsOfStaff(client, staffId)) !== "allowed";
  const named = approvalIdOf(context, payload.approvalId);
  const approvalId = needsApprover ? named : undefined;
  const approvedBy =
    approvalId === undefined
      ? null
      : await redeemApproval(context, approvalId, { key: "void_after_sent" });
  // Without an approver where one is needed, the domain refuses with its own code.
  const { order, record } = voidLine(stored.order, request(approvedBy, needsApprover));
  const write = { tenantId: device.tenantId, orderId: order.id, staffId };
  await writeOrderLines(client, write, stored.order.lines, order.lines);
  await client.query(
    "INSERT INTO line_void_record (id, tenant_id, order_id, line_id, quantity, from_unsent, " +
      "from_sent, reason_code, staff_id, approved_by_staff_id, approval_id, reversal_line_id, " +
      "created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $9)",
    [
      newId(),
      device.tenantId,
      order.id,
      record.lineId,
      quantityToDecimalString(record.quantity),
      quantityToDecimalString(record.fromUnsent),
      quantityToDecimalString(record.fromSent),
      record.reasonCode,
      staffId,
      record.approvedByStaffId,
      approvalId ?? null,
      record.reversalLineId,
    ],
  );
  await touchOrder(client, order.id);
  return order.id;
}

export const voidLineCommand = defineSyncCommand(
  "order.void_line",
  voidLinePayloadSchema,
  voidOrderLine,
);
