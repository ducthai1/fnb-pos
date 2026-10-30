import { buildTillMenu, NO_MENU_COPIES, type TillMenu } from "../../../../apps/pos/src/features/menu/till-menu";
import { parseBootstrap, tillPlaceOf } from "../../../../apps/pos/src/features/bootstrap/bootstrap-source";
import type { TillPlace } from "../../../../apps/pos/src/features/order/till-command";
import { handedOverTicket, isStaleDraft } from "../../../../apps/pos/src/features/table-order/redo-stale-draft";
import {
  type RedoMemory,
  newRedoMemory,
  redoStaleOrder,
} from "../../../../apps/pos/src/features/table-order/redo-stale-order";
import type { DayContext } from "./day-context";
import type { SimDevice } from "./simulated-shop";

/** What a till's cashier screen would hold across the day: the menu, where it sells, what it has dealt with. */
interface TillScreen {
  readonly menu: TillMenu;
  readonly place: TillPlace;
  readonly memory: RedoMemory;
  readonly recorded: Set<string>;
}

const screens = new WeakMap<SimDevice, TillScreen>();

/** The till's menu and place as it reads them from the server's bootstrap, once. */
async function screenOf(ctx: DayContext, device: SimDevice): Promise<TillScreen> {
  const known = screens.get(device);
  if (known !== undefined) return known;
  const answer = await ctx.shop.server.send({
    method: "GET",
    path: "/pos/bootstrap?call-numbering=1",
    headers: { authorization: `Device ${device.record.deviceToken}` },
  });
  const snapshot = answer.status === 200 ? parseBootstrap(JSON.parse(answer.body)) : null;
  if (snapshot === null) throw new Error(`${device.name}: the bootstrap answered ${answer.status}`);
  const made: TillScreen = {
    menu: buildTillMenu(snapshot, NO_MENU_COPIES, new Set()),
    place: tillPlaceOf(snapshot),
    memory: newRedoMemory(),
    recorded: new Set(),
  };
  screens.set(device, made);
  return made;
}

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
