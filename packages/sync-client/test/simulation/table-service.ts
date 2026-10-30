import { newId } from "@fnb/db";
import { type OrderView, type PickedItem, pick, saveDraft } from "../support/order-commands";
import { sendApproved } from "./approvals";
import type { DayContext } from "./day-context";
import {
  cancelOrder,
  percentOffOrder,
  preBillPrinted,
  removeOrderDiscount,
  sentToBar,
  transferTable,
  voidUnits,
} from "./sim-commands";
import type { BookedOrder } from "./shop-books";
import type { SimDevice } from "./simulated-shop";
import { type PaymentPlan, charge, planPayment } from "./taking-payment";

type Step = "send" | "add" | "discount" | "void" | "transfer";

/** The items a till shows on an order, as it saves them again: notes and toppings kept. */
export function keptItems(ctx: DayContext, view: OrderView): PickedItem[] {
  const { coffee } = ctx.shop.shop.menu;
  return view.lines
    .filter((line) => line.lineType === "item")
    .map((line) =>
      pick(line.productId ?? "", line.unitPrice, {
        lineId: line.id,
        variantId: line.variantId,
        quantity: line.quantity,
        note: line.note,
        modifiers: view.lines
          .filter((child) => child.parentLineId === line.id && child.lineType === "modifier")
          .map((child) => ({
            groupId: coffee.extrasGroup,
            optionId: child.modifierOptionId ?? "",
            quantity: Number(child.quantity),
            shownPrice: child.unitPrice,
          })),
      }),
    );
}

/** Adds `more` to the order as the till shows it and saves it again whole. */
export async function addItems(
  ctx: DayContext,
  device: SimDevice,
  order: BookedOrder,
  more: PickedItem[],
): Promise<boolean> {
  // The waiter opens the table on the server's copy, not on what their own queued changes
  // make of it: only offline, with nothing newer to wait for, does the till go on with its own.
  const view = await ctx.openable(device, order.id);
  if (view === null) return false;
  const tableId = view.tableId ?? undefined;
  await ctx.send(
    device,
    saveDraft(
      {
        id: order.id,
        deviceOrderNo: order.deviceOrderNo,
        base: view,
        expectedVersion: view.version,
        ...(tableId === undefined ? {} : { tableId }),
      },
      [...keptItems(ctx, view), ...more],
    ),
  );
  for (const item of more) {
    order.items.set(item.lineId, { productId: item.productId, quantity: item.quantity });
  }
  return true;
}

function scriptOf(ctx: DayContext): Step[] {
  const steps: Step[] = ["send"];
  for (let round = ctx.random.int(0, 2); round > 0; round -= 1) steps.push("add", "send");
  if (ctx.random.chance(0.15)) steps.push("discount");
  if (ctx.random.chance(0.2)) steps.push("void");
  if (ctx.random.chance(0.2)) steps.push("transfer");
  return steps;
}

/** The tables the till shows as empty: the floor map is the till's own copy of the orders. */
async function freeTables(ctx: DayContext, device: SimDevice): Promise<string[]> {
  const taken = new Set<string>();
  for (const view of await device.till.client.snapshots("order")) {
    const { status, tableId } = view.snapshot as { status?: string; tableId?: string | null };
    if (status === "draft" && typeof tableId === "string") taken.add(tableId);
  }
  return ctx.shop.tables.filter((tableId) => !taken.has(tableId) && !ctx.books.seats.has(tableId));
}

/** A party sits at a free table: the handheld takes the order, rings the bar, and later hands the bill over. */
export async function seatParty(ctx: DayContext, device: SimDevice): Promise<void> {
  const free = await freeTables(ctx, device);
  if (free.length === 0) return;
  const tableId = ctx.random.pick(free);
  const items = Array.from({ length: ctx.random.int(1, 3) }, () => ctx.item());
  const order = ctx.books.open({
    id: newId(),
    openedBy: device.name,
    deviceOrderNo: ctx.nextOrderNo(device),
    kind: "table",
    tableId,
    items: new Map(
      items.map((item) => [item.lineId, { productId: item.productId, quantity: item.quantity }]),
    ),
  });
  await ctx.send(
    device,
    saveDraft(
      { id: order.id, deviceOrderNo: order.deviceOrderNo, base: null, tableId, expectedVersion: 0 },
      items,
    ),
  );
  runScript(ctx, device, order, scriptOf(ctx));
}

function runScript(ctx: DayContext, device: SimDevice, order: BookedOrder, steps: Step[]): void {
  const [step, ...rest] = steps;
  if (step === undefined) {
    ctx.after(ctx.random.int(2, 5), `bill ${order.id}`, () => finish(ctx, device, order));
    return;
  }
  ctx.after(ctx.random.int(1, 4), `${step} ${order.id}`, async () => {
    if (!(await doStep(ctx, device, order, step))) return false;
    runScript(ctx, device, order, rest);
    return true;
  });
}

async function doStep(
  ctx: DayContext,
  device: SimDevice,
  order: BookedOrder,
  step: Step,
): Promise<boolean> {
  const view = await ctx.shown(device, order.id);
  if (view === null || order.state !== "open") return false;
  if (step === "add") {
    if (order.frozen) return true;
    return addItems(ctx, device, order, [ctx.item()]);
  }
  if (step === "send") return sendToBar(ctx, device, order, view);
  if (step === "discount") {
    if (order.discounted) return true;
    const given = await sendApproved(ctx, device, percentOffOrder(view, 1_000), {
      key: "order_discount",
      discountRate: 1_000,
      subject: { orderId: order.id },
    });
    if (!given) return false;
    order.discounted = true;
    return true;
  }
  if (step === "transfer") {
    const free = await freeTables(ctx, device);
    if (free.length === 0 || order.tableId === null) return true;
    const to = ctx.random.pick(free);
    await ctx.send(device, transferTable(view, to));
    ctx.books.seats.delete(order.tableId);
    ctx.books.seats.set(to, order.id);
    order.tableId = to;
    return true;
  }
  return voidAfterSent(ctx, device, order, view);
}

async function sendToBar(ctx: DayContext, device: SimDevice, order: BookedOrder, view: OrderView) {
  const shown = new Set(view.lines.map((line) => line.id));
  const owed = [...order.items]
    .filter(([lineId, item]) => shown.has(lineId) && order.sent.get(lineId) !== item.quantity)
    .map(([lineId, item]) => ({ lineId, quantity: item.quantity }));
  if (owed.length === 0) return true;
  await ctx.send(device, sentToBar(view, ctx.shop.stationId, owed));
  for (const line of owed) order.sent.set(line.lineId, line.quantity);
  return true;
}

/** Of `units` taken off a line, those the bar had: the rest were still unsent and come off first. */
function takenFromTheBar(order: BookedOrder, lineId: string, units: number): number {
  const ordered = Number(order.items.get(lineId)?.quantity ?? 0);
  const sent = Number(order.sent.get(lineId) ?? 0);
  return Math.max(0, Math.min(units, sent) - Math.max(0, ordered - sent));
}

/** A guest changes their mind about a drink the bar already has: one unit comes off. */
async function voidAfterSent(
  ctx: DayContext,
  device: SimDevice,
  order: BookedOrder,
  view: OrderView,
) {
  const candidates = [...order.sent.keys()].filter((lineId) => order.items.has(lineId));
  if (order.items.size < 2 || candidates.length === 0 || order.sent.size !== order.items.size)
    return true;
  const lineId = ctx.random.pick(candidates);
  // The till refuses a void that would push a discount past what the cashier may give alone
  // ("take the discount off, cancel, give it again"): the cashier leaves the drink be.
  if (order.discounted && !device.staff.manager) return true;
  if (!view.lines.some((line) => line.id === lineId)) return false;
  const given = await sendApproved(ctx, device, voidUnits(view, lineId, "1"), {
    key: "void_after_sent",
    voidedQuantity: String(takenFromTheBar(order, lineId, 1)),
    subject: { orderId: order.id, lineId },
  });
  if (!given) return false;
  ctx.books.voidCount += 1;
  order.frozen = true;
  const item = order.items.get(lineId)!;
  const left = Number(item.quantity) - 1;
  if (left < 1) order.items.delete(lineId);
  else order.items.set(lineId, { ...item, quantity: String(left) });
  if (left < 1) order.sent.delete(lineId);
  else order.sent.set(lineId, String(left));
  return true;
}

/** The bill: the guest goes to a counter and pays there, or walks out and the table is cancelled. */
async function finish(ctx: DayContext, device: SimDevice, order: BookedOrder): Promise<boolean> {
  if (order.state !== "open") return true;
  if (ctx.random.chance(0.08)) return cancelTable(ctx, device, order);
  const view = await ctx.shown(device, order.id);
  if (view === null) return false;
  await ctx.send(device, preBillPrinted(view));
  order.billed = true;
  const plan = planPayment(ctx);
  ctx.after(1, `hand over ${order.id}`, () => handOver(ctx, device, order, plan));
  return true;
}

async function cancelTable(
  ctx: DayContext,
  device: SimDevice,
  order: BookedOrder,
): Promise<boolean> {
  const view = await ctx.shown(device, order.id);
  if (view === null) return false;
  // What the bar has already is taken off first: an order with drinks standing cannot be
  // closed, and a whole-bill discount cannot outlast the goods it was given on.
  // A cashier needs a manager for the voids and the close: with none to ask, they wait.
  if (!device.staff.manager && !device.till.network.online) return false;
  // The till's own view of a discount only shows once the server has taken it: the cashier
  // waits for that rather than take off a discount they cannot see yet.
  const seen = view.lines.some((line) => line.lineType === "discount");
  if (order.discounted && !seen) return false;
  if (order.discounted) {
    await ctx.send(device, removeOrderDiscount(view));
    order.discounted = false;
  }
  for (const [lineId, quantity] of order.sent) {
    const asked = await sendApproved(ctx, device, voidUnits(view, lineId, quantity), {
      key: "void_after_sent",
      voidedQuantity: String(takenFromTheBar(order, lineId, Number(quantity))),
      subject: { orderId: order.id, lineId },
    });
    if (!asked)
      throw new Error(`${device.name} lost its manager halfway through cancelling ${order.id}`);
    ctx.books.voidCount += 1;
  }
  // The bar had the order (or the guest was shown the bill): closing it is a manager's call.
  const closed = await sendApproved(ctx, device, cancelOrder(view, "customer_left"), {
    key: "close_unpaid_table",
    subject: { orderId: order.id },
  });
  if (!closed) throw new Error(`${device.name} lost its manager before closing ${order.id}`);
  ctx.books.settle(order, "cancelled");
  return true;
}

/** The guest reaches a counter some minutes after the bill; the counter has to have pulled the order by then. */
async function handOver(ctx: DayContext, device: SimDevice, order: BookedOrder, plan: PaymentPlan) {
  // The guest only walks to the counter once the handheld has told the server about the bill.
  if ((await device.till.client.pendingCount()) > 0) return false;
  const version = (await device.till.client.snapshot("order", order.id))?.serverVersion ?? 0;
  ctx.after(ctx.random.int(3, 5), `pay at the counter ${order.id}`, async () => {
    const online = ctx.counters().filter((till) => till.till.network.online);
    if (online.length === 0) return false;
    const counter = ctx.random.pick(online);
    const shown = await counter.till.client.snapshot("order", order.id);
    if (shown === null || (shown.serverVersion ?? 0) < version) return false;
    if ((await counter.till.client.pendingCount()) > 0) return false;
    await charge(ctx, counter, order, plan);
    return true;
  });
  return true;
}
