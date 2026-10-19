import type { CommandDraft, LocalStore, OutboxEntry } from "../local-store/local-store";
import type { Quantity, Vnd } from "../shared/domain";
import {
  type OrderLineRow,
  type OrderRow,
  computeLineTotal,
  computeOrderTotal,
} from "../shared/order-rows";
import type { NewLineWire } from "../shared/sync-wire-types";
import { uuidV7 } from "../shared/uuid-v7";

export interface NewLineInput {
  itemId: string;
  name: string;
  qty: Quantity;
  unitPriceVnd: Vnd;
}

export interface PosContext {
  store: LocalStore;
  deviceId: string;
  businessDate: string;
  now: () => number;
}

function lineRow(orderId: string, input: NewLineInput): OrderLineRow {
  const lineTotalVnd = computeLineTotal(input.unitPriceVnd, input.qty);
  return { id: uuidV7(), orderId, ...input, lineTotalVnd };
}

function lineWire(row: OrderLineRow): NewLineWire {
  return {
    id: row.id,
    item_id: row.itemId,
    name: row.name,
    qty_thousandths: row.qty.toString(),
    unit_price_vnd: row.unitPriceVnd.toString(),
  };
}

function draft(ctx: PosContext, body: Omit<CommandDraft, "commandId" | "createdAt">): CommandDraft {
  return { ...body, commandId: uuidV7(), createdAt: ctx.now() } as CommandDraft;
}

/** What the cashier's "save order" does offline: rows and command in one local transaction. */
export async function createOrderOffline(
  ctx: PosContext,
  inputs: readonly NewLineInput[],
): Promise<OutboxEntry> {
  const orderId = uuidV7();
  const lines = inputs.map((input) => lineRow(orderId, input));
  const order: OrderRow = {
    id: orderId,
    deviceId: ctx.deviceId,
    businessDate: ctx.businessDate,
    status: "open",
    totalVnd: computeOrderTotal(lines),
    version: 1,
    updatedAt: ctx.now(),
  };
  const command = draft(ctx, {
    type: "order.create",
    payload: {
      order_id: orderId,
      business_date: ctx.businessDate,
      lines: lines.map(lineWire),
      client_total_vnd: order.totalVnd.toString(),
    },
  });
  return ctx.store.writeWithCommand({ orders: [order], lines }, command);
}

/** Returns null when the local copy is already paid: the UI blocks that before any command. */
export async function addLineOffline(
  ctx: PosContext,
  orderId: string,
  input: NewLineInput,
): Promise<OutboxEntry | null> {
  const snapshot = await ctx.store.readOrderSnapshot(orderId);
  if (snapshot === null || snapshot.order.status === "paid") return null;
  const line = lineRow(orderId, input);
  const totalVnd = computeOrderTotal([...snapshot.lines, line]);
  const order: OrderRow = {
    ...snapshot.order,
    totalVnd,
    version: snapshot.order.version + 1,
    updatedAt: ctx.now(),
  };
  const command = draft(ctx, {
    type: "order.add_line",
    payload: { order_id: orderId, line: lineWire(line), client_total_vnd: totalVnd.toString() },
  });
  return ctx.store.writeWithCommand({ orders: [order], lines: [line] }, command);
}

export async function payOrderOffline(
  ctx: PosContext,
  orderId: string,
): Promise<OutboxEntry | null> {
  const snapshot = await ctx.store.readOrderSnapshot(orderId);
  if (snapshot === null || snapshot.order.status === "paid") return null;
  const order: OrderRow = {
    ...snapshot.order,
    status: "paid",
    version: snapshot.order.version + 1,
    updatedAt: ctx.now(),
  };
  const command = draft(ctx, {
    type: "order.pay",
    payload: { order_id: orderId, client_total_vnd: order.totalVnd.toString() },
  });
  return ctx.store.writeWithCommand({ orders: [order], lines: [] }, command);
}
