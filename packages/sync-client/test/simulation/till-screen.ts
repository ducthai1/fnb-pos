import {
  parseBootstrap,
  tillPlaceOf,
} from "../../../../apps/pos/src/features/bootstrap/bootstrap-source";
import {
  NO_MENU_COPIES,
  type TillMenu,
  buildTillMenu,
} from "../../../../apps/pos/src/features/menu/till-menu";
import type { TillPlace } from "../../../../apps/pos/src/features/order/till-command";
import {
  type RedoMemory,
  newRedoMemory,
} from "../../../../apps/pos/src/features/table-order/redo-stale-order";
import type { DayContext } from "./day-context";
import type { SimDevice } from "./simulated-shop";

/** What a till's cashier screen would hold across the day: the menu, where it sells, what it has dealt with. */
export interface TillScreen {
  readonly menu: TillMenu;
  readonly place: TillPlace;
  readonly memory: RedoMemory;
  readonly recorded: Set<string>;
}

const screens = new WeakMap<SimDevice, TillScreen>();

/** The till's menu and place as it reads them from the server's bootstrap, once. */
export async function screenOf(ctx: DayContext, device: SimDevice): Promise<TillScreen> {
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
