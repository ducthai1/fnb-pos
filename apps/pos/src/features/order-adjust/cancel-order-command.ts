import { cancelOrderPayloadSchema } from "@fnb/contracts";
import { reversedQuantityOf } from "@fnb/domain";
import type { LocalCommand } from "@fnb/sync-client";
import { tillOrderSnapshot } from "../order/order-snapshot-for-till";
import type { AdjustableOrder } from "../order/order-session-types";
import { type TillPlace, tillCommand } from "../order/till-command";

/**
 * Whether the kitchen has units of the order nobody cancelled: the server refuses to cancel
 * such an order (food was made), which is what a void with its cancel ticket is for.
 */
export function kitchenStillHasItems(settled: AdjustableOrder): boolean {
  return settled.sent.some(
    (line) => line.sentQuantity > reversedQuantityOf(settled.priced.lines, line.lineId),
  );
}

/** order.cancel of a draft nobody will pay for, with why. */
export function cancelOrderCommand(
  place: TillPlace,
  settled: AdjustableOrder,
  reasonCode: string,
  at: number,
): LocalCommand {
  const orderId = settled.order.orderId;
  const state = {
    ...settled.state,
    status: "cancelled" as const,
    reasonCode,
    version: settled.state.version + 1,
    sent: settled.sent,
  };
  return tillCommand(place, "order.cancel", cancelOrderPayloadSchema, { orderId, reasonCode }, at, {
    entity: "order",
    entityId: orderId,
    optimistic: tillOrderSnapshot(place, settled.order, settled.priced, state),
  });
}
