import { randomBytes } from "node:crypto";
import { sendFakeNotice } from "@fnb/api/test-support/payment-webhooks";
import { newId } from "@fnb/db";
import { contentCodeFromRandom } from "@fnb/domain/payment";
import { amountDueOf } from "../support/order-amount-due";
import { pay } from "../support/order-commands";
import type { DayContext } from "./day-context";
import { payByQr, refundInCash, showQr, takeQrDown } from "./sim-commands";
import type { BookedOrder } from "./shop-books";
import type { SimDevice } from "./simulated-shop";

export type PaymentPlan = "cash" | "qr" | "qr_abandoned";

/** How long the cashier shows a QR to a customer who is not going to pay it before taking cash. */
const QR_WAIT_MINUTES = 8;

/** What fraction of customers pay each way. */
export function planPayment(ctx: DayContext): PaymentPlan {
  const roll = ctx.random.next();
  if (roll < 0.62) return "cash";
  return roll < 0.94 ? "qr" : "qr_abandoned";
}

/**
 * The cashier asks the customer for what the till shows, in cash. The drawer is the shop's
 * own book of it: the system has to agree with it at the close.
 */
async function takeCash(ctx: DayContext, device: SimDevice, order: BookedOrder): Promise<void> {
  const view = await ctx.shown(device, order.id);
  if (view === null) throw new Error(`${device.name} shows no order ${order.id} to take cash for`);
  const amount = amountDueOf(view);
  await ctx.send(device, pay(view, amount));
  device.drawer += amount;
  order.amountDue = amount;
  order.method = "cash";
  order.paidOn = device.name;
  ctx.books.settle(order, "paid");
}

async function payWithPaidQr(
  ctx: DayContext,
  device: SimDevice,
  order: BookedOrder,
  intentId: string,
) {
  const view = await ctx.shown(device, order.id);
  if (view === null) throw new Error(`${device.name} shows no order ${order.id} paid by QR`);
  const amount = amountDueOf(view);
  await ctx.send(device, payByQr(view, amount, intentId));
  order.amountDue = amount;
  order.method = "qr_transfer";
  order.paidOn = device.name;
  ctx.books.settle(order, "paid");
}

/** The customer scans the QR and the bank tells the server, whatever state the till is in. */
async function customerPays(ctx: DayContext, code: string, amount: number): Promise<void> {
  const answer = await sendFakeNotice(
    ctx.shop.server.api,
    ctx.shop.shop.shop.tenantId,
    ctx.shop.webhookSecret,
    { reference: newId(), amount, content: code },
  );
  if (answer.statusCode !== 200) throw new Error(`the bank notice answered ${answer.statusCode}`);
}

/** Shows a QR for the whole amount; the order is paid when the till sees the transfer arrive. */
async function askForQr(ctx: DayContext, device: SimDevice, order: BookedOrder, plan: PaymentPlan) {
  const view = await ctx.shown(device, order.id);
  if (view === null) throw new Error(`${device.name} shows no order ${order.id} for a QR`);
  const amount = amountDueOf(view);
  const intentId = newId();
  const code = contentCodeFromRandom(randomBytes(8));
  await ctx.send(device, showQr(view, amount, intentId, code));
  const askedAt = ctx.now();
  if (plan === "qr") {
    // The bank's notice comes some minutes after the customer is shown the code.
    ctx.after(ctx.random.int(0, 8), `bank notice for ${order.id}`, async () => {
      await customerPays(ctx, code, amount);
      return true;
    });
  }
  ctx.after(1, `QR of ${order.id} paid`, async () => {
    const intent = await device.till.client.snapshot("payment_intent", intentId);
    if (intent?.snapshot.status === "paid") {
      await payWithPaidQr(ctx, device, order, intentId);
      return true;
    }
    // Only a customer who never meant to pay by QR is given up on: one who is paying is waited
    // for however long the till takes to hear of it, or the same bill would be paid twice.
    if (plan === "qr" || ctx.now() - askedAt < QR_WAIT_MINUTES * 60_000) return false;
    // The customer gave up on the QR: the cashier takes it down and takes cash.
    if (intent === null) throw new Error(`${device.name} lost the QR ${intentId}`);
    await ctx.send(device, takeQrDown({ ...intent.snapshot, id: intentId }));
    await takeCash(ctx, device, order);
    return true;
  });
}

/** Charges the order at `device` by the customer's plan, once the till shows it as the server has it. */
export async function charge(
  ctx: DayContext,
  device: SimDevice,
  order: BookedOrder,
  plan: PaymentPlan,
): Promise<void> {
  if (plan === "cash") await takeCash(ctx, device, order);
  else await askForQr(ctx, device, order, plan);
}

/** A cash sale of the day is refunded whole, the money handed back from the same drawer. */
export async function refundSale(
  ctx: DayContext,
  device: SimDevice,
  order: BookedOrder,
): Promise<void> {
  const sale = await ctx.shown(device, order.id);
  if (sale === null || order.amountDue === null)
    throw new Error(`nothing to refund for ${order.id}`);
  const { refundOrderId, command } = refundInCash(sale, order.amountDue, ctx.nextOrderNo(device));
  await ctx.send(device, command);
  device.drawer -= order.amountDue;
  order.refunded = true;
  ctx.books.refunds.push({ refundOrderId, saleOrderId: order.id, amount: order.amountDue });
}
