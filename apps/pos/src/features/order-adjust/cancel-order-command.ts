import { type EntitySnapshot, cancelOrderPayloadSchema } from "@fnb/contracts";
import { type PermissionAction, reversedQuantityOf } from "@fnb/domain";
import type { LocalCommand } from "@fnb/sync-client";
import { tillOrderSnapshot } from "../order/order-snapshot-for-till";
import type { AdjustableOrder } from "../order/order-session-types";
import { type TillPlace, tillCommand } from "../order/till-command";
import { type ChosenReason, reasonOnWire } from "./reason-codes";

/**
 * Whether the kitchen has units of the order nobody cancelled: the server refuses to cancel
 * such an order (food was made), which is what a void with its cancel ticket is for.
 */
export function kitchenStillHasItems(settled: AdjustableOrder): boolean {
  const cancelLines = new Set(
    settled.priced.lines.filter((line) => line.reversesLineId !== null).map((line) => line.id),
  );
  // A cancel line's own ticket is the kitchen being told to stop, not food it still has.
  return settled.sent.some(
    (line) =>
      !cancelLines.has(line.lineId) &&
      line.sentQuantity > reversedQuantityOf(settled.priced.lines, line.lineId),
  );
}

/**
 * What closing draft `orderId` nobody paid for needs, once it is more than a draft on the
 * till; an approval of it covers that order only.
 */
export function closeUnpaidTable(orderId: string): PermissionAction {
  return { key: "close_unpaid_table", subject: { orderId } };
}

/**
 * Whether cancelling needs close_unpaid_table, as the server judges it: the guests were
 * shown a bill (a pre-bill printed, even of an earlier version) or the kitchen was sent
 * part of the order (even if all of it was voided since). `row` is the order as the till
 * holds it; the server's copy says when a pre-bill was last printed.
 */
export function cancelNeedsManager(settled: AdjustableOrder, row: EntitySnapshot | null): boolean {
  const kitchenHadIt = settled.sent.some((line) => line.sentQuantity > 0n);
  const shownABill =
    row !== null && (row.preBillPrinted === true || typeof row.preBillPrintedVersion === "number");
  return kitchenHadIt || shownABill;
}

/**
 * order.cancel of a draft nobody will pay for, with why (an "other" reason with its note) and
 * the manager who agreed.
 */
export function cancelOrderCommand(
  place: TillPlace,
  settled: AdjustableOrder,
  reason: ChosenReason,
  approvalId: string | null,
  at: number,
): LocalCommand {
  const orderId = settled.order.orderId;
  const state = {
    ...settled.state,
    status: "cancelled" as const,
    reasonCode: reason.code,
    version: settled.state.version + 1,
    sent: settled.sent,
  };
  const payload = {
    orderId,
    ...reasonOnWire(reason),
    ...(approvalId === null ? {} : { approvalId }),
  };
  return tillCommand(place, "order.cancel", cancelOrderPayloadSchema, payload, at, {
    entity: "order",
    entityId: orderId,
    optimistic: tillOrderSnapshot(place, settled.order, settled.priced, state),
  });
}
