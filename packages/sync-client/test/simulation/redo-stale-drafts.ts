import {
  handedOverTicket,
  isStaleDraft,
} from "../../../../apps/pos/src/features/table-order/redo-stale-draft";
import { redoStaleOrder } from "../../../../apps/pos/src/features/table-order/redo-stale-order";
import type { DayContext } from "./day-context";
import { screenOf } from "./till-screen";

/**
 * A draft the server refused because another till changed the table first: the cashier's
 * till saves again, with the POS's own redo, what that draft added over the server's newer
 * copy, and records again the bar tickets it had already printed for those items. Refusals
 * of this kind are expected and counted.
 */
export async function redoStaleDrafts(ctx: DayContext): Promise<void> {
  for (const device of ctx.shop.devices) {
    const refusals = await device.till.client.rejectedCommands();
    const orders = new Set<string>();
    for (const refused of refusals) {
      if (!isStaleDraft(refused) && handedOverTicket(refused) === null) continue;
      if (!ctx.books.orders.has(refused.entityId)) continue;
      ctx.books.meantToBeRefused.add(refused.command.commandId);
      if (isStaleDraft(refused)) orders.add(refused.entityId);
    }
    if (orders.size === 0) continue;
    const screen = await screenOf(ctx, device);
    for (const refused of refusals) screen.recorded.add(refused.command.commandId);
    for (const orderId of orders) {
      const before = await device.till.client.pendingCount();
      const done = await redoStaleOrder({
        client: device.till.client,
        place: screen.place,
        menu: screen.menu,
        orderId,
        recorded: screen.recorded,
        memory: screen.memory,
        // The world's clock moves by hand: a copy that is not the server's yet waits for the next round.
        waitMs: 20,
        now: () => ctx.now() + device.skewMs,
      });
      if (done === null) continue;
      // The redo and the tickets recorded behind it are commands this till issued.
      ctx.books.commandsIssued += (await device.till.client.pendingCount()) - before;
    }
  }
}
