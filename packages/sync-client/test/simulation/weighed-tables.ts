import { newId } from "@fnb/db";
import { readStoredOrder } from "../../../../apps/pos/src/features/order/stored-order";
import { weighedOnSlip } from "../../../../apps/pos/src/features/printing/weighed-print";
import { amountDueOf } from "../support/order-amount-due";
import { type OrderView, pay, pick, saveDraft } from "../support/order-commands";
import type { DayContext } from "./day-context";
import type { BookedOrder } from "./shop-books";
import { sentToBar, voidUnits } from "./sim-commands";
import type { SimDevice } from "./simulated-shop";
import { addItems, freeTables } from "./table-service";
import { screenOf } from "./till-screen";

type Unit = "kg" | "100g";
const GRAMS_PER: Record<Unit, number> = { kg: 1_000, "100g": 100 };
/** Dried beef by weight: 450.000 đ a kilo, then 45.000 đ per 100 g once the shop changes it. */
const PER_KG = 450_000;

/** The quantity a weight is typed as in `unit`: 351 g is 0.351 kg or 3.51 per 100 g. */
const quantityOf = (grams: number, unit: Unit) => String(grams / GRAMS_PER[unit]);

async function putBeef(ctx: DayContext, id: string, unit: Unit): Promise<void> {
  const cookie = ctx.shop.shop.shop.managerCookie;
  const url = `/catalog/products/${id}`;
  const current = await ctx.shop.server.backoffice({ method: "GET", url, cookie });
  const version =
    current.status === 200 ? (JSON.parse(current.body) as { version: number }).version : null;
  const saved = await ctx.shop.server.backoffice({
    method: "PUT",
    url,
    cookie,
    payload: {
      version,
      brandId: ctx.shop.shop.brandId,
      kind: "retail_item",
      name: "Bò khô xé (cân)",
      pricingMode: "weighed",
      measureUnit: unit,
      basePrice: unit === "kg" ? PER_KG : PER_KG / 10,
      taxRateBp: 800,
    },
  });
  if (saved.status >= 300)
    throw new Error(`saving the beef answered ${saved.status} ${saved.body}`);
}

/** The server's copy of a table once the till has nothing of it waiting. */
async function serverCopy(device: SimDevice, orderId: string): Promise<OrderView | null> {
  if ((await device.till.client.pendingCount()) > 0) return null;
  const view = await device.till.client.snapshot("order", orderId);
  return view?.source === "server" ? (view.snapshot as unknown as OrderView) : null;
}

/**
 * Every weighed line of an order as two tills would print it on a bill or a reprint: the
 * grams and the unit printed must be what the line was priced per and what was weighed.
 */
async function checkBills(ctx: DayContext, devices: readonly SimDevice[], orderId: string) {
  for (const device of devices) {
    const view = await device.till.client.snapshot("order", orderId);
    const stored = view === null ? null : readStoredOrder(view.snapshot);
    if (stored === null) continue;
    const { menu } = await screenOf(ctx, device);
    for (const line of stored.lines) {
      const booked = ctx.books.weighed.get(line.id);
      if (booked === undefined || line.reversesLineId !== null) continue;
      const printed = weighedOnSlip(menu, line.productId, line.quantity, line.measureUnit);
      if (printed?.per !== booked.unit || printed.grams !== booked.grams + booked.voidedGrams)
        ctx.books.weighedFindings.push(
          `${device.name} prints ${line.id} as ${printed?.grams} g per ${printed?.per}, it was ${booked.grams + booked.voidedGrams} g per ${booked.unit}`,
        );
    }
  }
}

/**
 * Two tables hold dried beef sold by weight, one on the handheld and one on counter-1. With
 * the bar's ticket for counter-1's table printed, counter-1 loses its network and keeps the
 * menu it had; the manager changes the beef from per kilo to per 100 g meanwhile. Offline,
 * counter-1 weighs more beef in kilos and takes 351 g off the line the bar has; online, the
 * handheld weighs more in 100 g. Back online, both tables are paid at counter-1, and both
 * tills' bills of them are read. False: no two free tables yet.
 */
export async function weighedTables(ctx: DayContext): Promise<boolean> {
  const handheld = ctx.device("handheld");
  const counter = ctx.device("counter-1");
  // Each till seats only a table its own floor shows free.
  const [first] = await freeTables(ctx, handheld);
  const second = (await freeTables(ctx, counter)).find((id) => id !== first);
  if (first === undefined || second === undefined) return false;
  const beefId = newId();
  await putBeef(ctx, beefId, "kg");
  const beef = (grams: number, unit: Unit, shownPerUnit: number) => {
    const item = pick(beefId, shownPerUnit, {
      quantity: quantityOf(grams, unit),
      measureUnit: unit,
    });
    ctx.books.weighed.set(item.lineId, { grams, unit, voidedGrams: 0 });
    return item;
  };
  const seat = async (device: SimDevice, tableId: string, grams: number) => {
    const items = [beef(grams, "kg", PER_KG), ctx.item()];
    const order = ctx.books.open({
      id: newId(),
      openedBy: device.name,
      deviceOrderNo: ctx.nextOrderNo(device),
      kind: "table",
      tableId,
      items: new Map(
        items.map((i) => [i.lineId, { productId: i.productId, quantity: i.quantity }]),
      ),
    });
    // Nothing else of the day touches these two tables.
    order.frozen = true;
    order.billed = true;
    await ctx.send(
      device,
      saveDraft({ id: order.id, deviceOrderNo: order.deviceOrderNo, base: null, tableId }, items),
    );
    return { order, beefLine: items[0]?.lineId ?? "" };
  };
  const atHandheld = await seat(handheld, first, 351);
  const atCounter = await seat(counter, second, 702);
  // The counter's till keeps the menu it has now through what follows.
  await screenOf(ctx, counter);

  ctx.after(2, "the bar's ticket for the weighed table", async () => {
    const view = await serverCopy(counter, atCounter.order.id);
    if (view === null) return false;
    await ctx.send(
      counter,
      sentToBar(view, ctx.shop.stationId, [{ lineId: atCounter.beefLine, quantity: "0.702" }]),
    );
    atCounter.order.sent.set(atCounter.beefLine, "0.702");
    ctx.after(2, "counter-1 goes offline holding the weighed table", async () => {
      if ((await counter.till.client.pendingCount()) > 0) return false;
      counter.till.network.online = false;
      await putBeef(ctx, beefId, "100g");
      ctx.after(2, "beef weighed on both sides of the unit change", () =>
        weighAcrossTheChange(ctx, { handheld, counter, atHandheld, atCounter, beef }),
      );
      return true;
    });
    return true;
  });
  return true;
}

interface Across {
  handheld: SimDevice;
  counter: SimDevice;
  atHandheld: { order: BookedOrder; beefLine: string };
  atCounter: { order: BookedOrder; beefLine: string };
  beef: (grams: number, unit: Unit, shownPerUnit: number) => ReturnType<typeof pick>;
}

async function weighAcrossTheChange(ctx: DayContext, at: Across): Promise<boolean> {
  const { handheld, counter, atHandheld, atCounter, beef } = at;
  // Offline on the old menu: more beef typed in kilos, and 351 g of the bar's beef taken off.
  const more = beef(250, "kg", PER_KG);
  if (!(await addItems(ctx, counter, atCounter.order, [more]))) {
    ctx.books.weighed.delete(more.lineId);
    return false;
  }
  const shown = await ctx.shown(counter, atCounter.order.id);
  if (shown === null) throw new Error("counter-1 lost the weighed table it just saved");
  await ctx.send(counter, voidUnits(shown, atCounter.beefLine, "0.351"));
  ctx.books.voidCount += 1;
  const kept = atCounter.order.items.get(atCounter.beefLine);
  if (kept !== undefined)
    atCounter.order.items.set(atCounter.beefLine, { ...kept, quantity: "0.351" });
  const booked = ctx.books.weighed.get(atCounter.beefLine);
  if (booked !== undefined) {
    booked.grams = 351;
    booked.voidedGrams = 351;
  }
  // The handheld has the new menu: 350 g is 3.5 per 100 g.
  ctx.after(1, "the handheld weighs beef per 100 g", async () => {
    const per100 = beef(350, "100g", PER_KG / 10);
    if (await addItems(ctx, handheld, atHandheld.order, [per100])) return true;
    ctx.books.weighed.delete(per100.lineId);
    return false;
  });
  ctx.after(20, "counter-1 is back with the weighed table", async () => {
    counter.till.network.online = true;
    ctx.after(2, "the weighed tables are paid", () => payBoth(ctx, at));
    return true;
  });
  return true;
}

async function payBoth(ctx: DayContext, at: Across): Promise<boolean> {
  const { handheld, counter } = at;
  const orders = [at.atHandheld.order, at.atCounter.order];
  const views = await Promise.all(orders.map((order) => serverCopy(counter, order.id)));
  const theirs = await Promise.all(orders.map((order) => serverCopy(handheld, order.id)));
  // The counter charges only once it holds the copy the handheld last saved.
  if (views.some((view, index) => view === null || view.version !== theirs[index]?.version))
    return false;
  for (const [index, order] of orders.entries()) {
    const view = views[index];
    if (view === undefined || view === null) continue;
    // A line saved again after the change is priced per 100 g, its grams kept: booked as stored.
    for (const line of view.lines) {
      const weighed = ctx.books.weighed.get(line.id);
      if (weighed !== undefined && line.reversesLineId === null) {
        weighed.unit = line.measureUnit ?? weighed.unit;
        const net = weighed.grams / GRAMS_PER[weighed.unit];
        order.items.set(line.id, { productId: line.productId ?? "", quantity: String(net) });
      }
    }
    await checkBills(ctx, [counter, handheld], order.id);
    const amount = amountDueOf(view);
    await ctx.send(counter, pay(view, amount));
    counter.drawer += amount;
    order.amountDue = amount;
    order.method = "cash";
    order.paidOn = counter.name;
    ctx.books.settle(order, "paid");
  }
  ctx.books.weighedPaid = true;
  return true;
}

/** The grams a stored weighed quantity stands for, in the unit the line was priced per. */
export const gramsOf = (units: string, unit: string) =>
  Math.round(Number(units) * (unit === "100g" ? 100 : 1_000));
