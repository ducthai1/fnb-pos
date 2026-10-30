import { newId } from "@fnb/db";
import type { LocalCommand } from "../../src";
import { type OrderView, envelope } from "../support/order-commands";

/** The smallest note: change below it never sits in a counted drawer. */
export const SMALLEST_NOTE = 500;

type Optimistic = Record<string, unknown>;

const onOrder = (
  type: string,
  payload: Record<string, unknown>,
  order: Optimistic & { id: string },
) =>
  ({
    ...envelope(type, payload),
    target: { entity: "order", entityId: order.id, optimistic: order },
  }) satisfies LocalCommand;

/** What the till shows of the order once the server has taken one more change to it. */
const changed = (order: OrderView, fields: Optimistic = {}): OrderView & Optimistic => ({
  ...order,
  ...fields,
  version: order.version + 1,
});

export const cancelOrder = (order: OrderView, reasonCode = "customer_left") =>
  onOrder(
    "order.cancel",
    { orderId: order.id, reasonCode },
    changed(order, { status: "cancelled" }),
  );

export const voidUnits = (order: OrderView, lineId: string, units: string) =>
  onOrder(
    "order.void_line",
    { orderId: order.id, lineId, quantity: units, reasonCode: "customer_changed_mind" },
    changed(order),
  );

export const percentOffOrder = (order: OrderView, rate: number) =>
  onOrder(
    "order.apply_discount",
    {
      orderId: order.id,
      discountLineIds: [newId()],
      scope: "order",
      discount: { kind: "percent", rate },
    },
    changed(order),
  );

/** Takes the order's whole-bill discount off; `view` is the order with its discount line. */
export const removeOrderDiscount = (order: OrderView) =>
  onOrder(
    "order.remove_discount",
    {
      orderId: order.id,
      discountLineIds: order.lines
        .filter((line) => line.lineType === "discount" && line.parentLineId === null)
        .map((line) => line.id),
    },
    changed(order),
  );

export const transferTable = (order: OrderView, toTableId: string) =>
  onOrder(
    "table.transfer",
    { orderId: order.id, toTableId },
    changed(order, { tableId: toTableId }),
  );

export const preBillPrinted = (order: OrderView) =>
  onOrder("order.mark_pre_bill_printed", { orderId: order.id }, changed(order));

export const sentToBar = (
  order: OrderView,
  stationId: string,
  lines: { lineId: string; quantity: string }[],
) =>
  onOrder(
    "order.mark_sent_to_kitchen",
    {
      orderId: order.id,
      ticketId: newId(),
      stations: [{ stationId, lines: lines.map((line) => ({ ...line, kind: "new", note: null })) }],
    },
    changed(order),
  );

/** order.pay with a QR transfer the till has seen turn paid. */
export const payByQr = (order: OrderView, amount: number, intentId: string) => {
  const payments = [{ method: "qr_transfer", amount, paymentIntentId: intentId }];
  return onOrder(
    "order.pay",
    { orderId: order.id, payments, expectedAmountDue: amount },
    changed(order, { status: "paid", payments }),
  );
};

export const showQr = (
  order: OrderView,
  amount: number,
  intentId: string,
  contentCode: string,
) => ({
  ...envelope("payment.create_intent", { intentId, orderId: order.id, amount, contentCode }),
  target: {
    entity: "payment_intent",
    entityId: intentId,
    optimistic: {
      id: intentId,
      orderId: order.id,
      amount,
      contentCode,
      status: "pending",
      version: 1,
    },
  },
});

export const takeQrDown = (intent: Optimistic & { id: string }) => ({
  ...envelope("payment.cancel_intent", { intentId: intent.id }),
  target: {
    entity: "payment_intent",
    entityId: intent.id,
    optimistic: { ...intent, status: "cancelled", version: Number(intent.version ?? 1) + 1 },
  },
});

/** order.refund of a whole cash sale, the money handed back from the drawer. */
export function refundInCash(sale: OrderView, amount: number, deviceOrderNo: number) {
  const refundOrderId = newId();
  const items = sale.lines.filter((line) => line.lineType === "item");
  return {
    refundOrderId,
    command: {
      ...envelope("order.refund", {
        refundOrderId,
        saleOrderId: sale.id,
        deviceOrderNo,
        lines: items.map((line) => ({ lineId: line.id, quantity: line.quantity, restock: false })),
        reasonCode: "wrong_drink",
        payouts: [{ method: "cash", amount: -amount }],
      }),
      target: {
        entity: "order",
        entityId: refundOrderId,
        optimistic: {
          id: refundOrderId,
          status: "paid",
          version: 1,
          lines: [],
          payments: [{ method: "cash", amount: -amount }],
        },
      },
    } satisfies LocalCommand,
  };
}

/** The notes a cashier counts for `amount`, largest first. */
export function notesFor(amount: number) {
  const rows: { denomination: number; pieces: number }[] = [];
  let left = amount;
  for (const note of [
    500_000, 200_000, 100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000, 500,
  ]) {
    const pieces = Math.floor(left / note);
    if (pieces > 0) rows.push({ denomination: note, pieces });
    left -= pieces * note;
  }
  if (left !== 0) throw new Error(`${amount} is not a whole number of notes`);
  return rows;
}

const onShift = (
  type: string,
  shiftId: string,
  payload: Record<string, unknown>,
  shown: Optimistic,
) =>
  ({
    ...envelope(type, payload),
    target: { entity: "shift", entityId: shiftId, optimistic: { id: shiftId, ...shown } },
  }) satisfies LocalCommand;

export const openShiftWith = (shiftId: string, openingCash: number) =>
  onShift(
    "shift.open",
    shiftId,
    { shiftId, openingCash, denominations: notesFor(openingCash) },
    {
      status: "open",
    },
  );

export const closeShiftCounting = (shiftId: string, counted: number) =>
  onShift(
    "shift.close",
    shiftId,
    { counted, denominations: notesFor(counted) },
    { status: "closed" },
  );

export const moveCash = (shiftId: string, kind: "in" | "out", amount: number, reason: string) =>
  onShift("shift.cash_move", shiftId, { cashMoveId: newId(), kind, amount, reason }, {});
