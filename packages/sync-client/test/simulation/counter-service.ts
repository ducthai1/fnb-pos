import { newId } from "@fnb/db";
import { type PickedItem, saveDraft } from "../support/order-commands";
import { sendApproved } from "./approvals";
import type { DayContext } from "./day-context";
import { cancelOrder, percentOffOrder } from "./sim-commands";
import type { BookedOrder } from "./shop-books";
import type { SimDevice } from "./simulated-shop";
import { charge, planPayment, refundSale } from "./taking-payment";

/** A customer at the counter: one to three items, then the cash or the QR a minute or two on. */
export async function counterSale(ctx: DayContext, device: SimDevice): Promise<void> {
  const items: PickedItem[] = Array.from({ length: ctx.random.int(1, 3) }, () => ctx.item());
  const order = ctx.books.open({
    id: newId(),
    openedBy: device.name,
    deviceOrderNo: ctx.nextOrderNo(device),
    kind: "counter",
    tableId: null,
    items: new Map(
      items.map((item) => [item.lineId, { productId: item.productId, quantity: item.quantity }]),
    ),
  });
  await ctx.send(
    device,
    saveDraft({ id: order.id, deviceOrderNo: order.deviceOrderNo, base: null }, items),
  );
  const plan = planPayment(ctx);
  const fate = ctx.random.next();
  if (fate < 0.03) {
    ctx.after(1, `customer leaves ${order.id}`, () => walkOut(ctx, device, order));
  } else if (fate < 0.08 && device.till.network.online) {
    ctx.after(1, `discount ${order.id}`, () => discountThenCharge(ctx, device, order, plan));
  } else {
    ctx.after(ctx.random.int(1, 2), `charge ${order.id}`, () =>
      chargeWhenSynced(ctx, device, order, plan),
    );
  }
}

/** The cashier charges what the till shows only once the till is as the server has it. */
export async function chargeWhenSynced(
  ctx: DayContext,
  device: SimDevice,
  order: BookedOrder,
  plan: Parameters<typeof charge>[3],
): Promise<boolean> {
  if (order.state !== "open") return true;
  // Offline, the cashier goes by what the till shows: there is nothing newer to wait for.
  if (device.till.network.online && (await device.till.client.pendingCount()) > 0) return false;
  await charge(ctx, device, order, plan);
  if (order.method === "cash" && !order.discounted && ctx.random.chance(0.04)) {
    ctx.after(ctx.random.int(5, 30), `refund ${order.id}`, () =>
      refundWhenPaid(ctx, device, order),
    );
  }
  return true;
}

async function discountThenCharge(
  ctx: DayContext,
  device: SimDevice,
  order: BookedOrder,
  plan: Parameters<typeof charge>[3],
): Promise<boolean> {
  const view = await ctx.shown(device, order.id);
  if (view === null) return false;
  const given = await sendApproved(ctx, device, percentOffOrder(view, 1_000), {
    key: "order_discount",
    discountRate: 1_000,
    subject: { orderId: order.id },
  });
  if (!given) return false;
  order.discounted = true;
  ctx.after(1, `charge ${order.id}`, () => chargeWhenSynced(ctx, device, order, plan));
  return true;
}

async function walkOut(ctx: DayContext, device: SimDevice, order: BookedOrder): Promise<boolean> {
  const view = await ctx.shown(device, order.id);
  if (view === null) return false;
  await ctx.send(device, cancelOrder(view));
  ctx.books.settle(order, "cancelled");
  return true;
}

async function refundWhenPaid(
  ctx: DayContext,
  device: SimDevice,
  order: BookedOrder,
): Promise<boolean> {
  const view = await device.till.client.snapshot("order", order.id);
  // The sale must have reached the server, or there is no sale to take back yet.
  if (view?.source !== "server" || view.snapshot.status !== "paid") return false;
  return refundSale(ctx, device, order);
}
