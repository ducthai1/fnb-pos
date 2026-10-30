import { dismissRejectionCommand } from "../../../../apps/pos/src/features/sync/dismiss-rejection-command";
import { type OrderView } from "../support/order-commands";
import { pay } from "../support/order-commands";
import { managerApproves } from "./approvals";
import type { DayContext } from "./day-context";
import type { BookedOrder } from "./shop-books";
import type { SimDevice } from "./simulated-shop";
import { screenOf } from "./till-screen";

/**
 * A cashier taps "Thanh toán" twice: the second payment of the bill the server already holds
 * as paid is refused. The cash was taken once, so nothing is owed back; the cashier sets the
 * refusal aside from "Cần xử lý" with a manager's approval of that order, as the money a
 * refused payment stands for may not vanish from the till without a name beside it.
 */
export async function tapPayTwice(
  ctx: DayContext,
  device: SimDevice,
  order: BookedOrder,
  unpaid: OrderView,
  amount: number,
): Promise<void> {
  const second = pay(unpaid, amount);
  ctx.books.meantToBeRefused.add(second.commandId);
  await ctx.send(device, second);
  ctx.after(3, `set aside the second payment of ${order.id}`, async () => {
    const refused = (await device.till.client.rejectedCommands()).find(
      (entry) => entry.command.commandId === second.commandId,
    );
    // The server has not answered yet.
    if (refused === undefined) return false;
    const approvalId = device.staff.manager
      ? null
      : await managerApproves(ctx, device, {
          key: "close_unpaid_table",
          subject: { orderId: order.id },
        });
    if (!device.staff.manager && approvalId === null) return false;
    const { place } = await screenOf(ctx, device);
    const reason = {
      code: "handled_by_hand" as const,
      note: "Khách đưa tiền hai lần, đã trả lại một lần",
    };
    const dismissal = dismissRejectionCommand(place, refused, reason, ctx.now() + device.skewMs, {
      orderId: order.id,
      approvalId,
    });
    await ctx.send(device, dismissal);
    await device.till.client.resolveRejected(second.commandId);
    ctx.books.dismissed += 1;
    return true;
  });
}
