import type { PoolClient } from "pg";
import { ZERO_VND } from "../shared/domain";
import { type OrderRow, computeOrderTotal } from "../shared/order-rows";
import { lineToWire, orderToWire } from "../shared/order-wire-codec";
import { SYNC_ERROR_CODES } from "../shared/sync-error-codes";
import type {
  AddLinePayload,
  ChangeWire,
  CommandWire,
  CreateOrderPayload,
  PayOrderPayload,
} from "../shared/sync-wire-types";
import {
  bumpDayTotal,
  insertLine,
  insertOrder,
  lineFromCommand,
  lockOrder,
  readLines,
  updateOrder,
} from "./server-order-rows";

export type ChangeRow = Omit<ChangeWire, "change_seq">;

export type HandlerOutcome =
  | { status: "accepted"; orderId: string; changes: ChangeRow[] }
  | { status: "rejected"; orderId: string; code: string };

const reject = (orderId: string, code: string): HandlerOutcome => ({
  status: "rejected",
  orderId,
  code,
});

async function createOrder(
  client: PoolClient,
  deviceId: string,
  p: CreateOrderPayload,
  now: number,
): Promise<HandlerOutcome> {
  const lines = p.lines.map((line) => lineFromCommand(p.order_id, line));
  const totalVnd = computeOrderTotal(lines);
  if (totalVnd.toString() !== p.client_total_vnd) {
    return reject(p.order_id, SYNC_ERROR_CODES.orderTotalMismatch);
  }
  if ((await lockOrder(client, p.order_id)) !== null) {
    return reject(p.order_id, SYNC_ERROR_CODES.orderAlreadyExists);
  }
  const order: OrderRow = {
    id: p.order_id,
    deviceId,
    businessDate: p.business_date,
    status: "open",
    totalVnd,
    version: 1,
    updatedAt: now,
  };
  await insertOrder(client, order);
  for (const line of lines) await insertLine(client, line);
  await bumpDayTotal(client, order.businessDate, { orders: 1, paid: 0, paidVnd: ZERO_VND });
  return {
    status: "accepted",
    orderId: order.id,
    changes: [
      { entity: "order", data: orderToWire(order) },
      ...lines.map((line) => ({ entity: "order_line" as const, data: lineToWire(line) })),
    ],
  };
}

async function addLine(client: PoolClient, p: AddLinePayload, now: number): Promise<HandlerOutcome> {
  const current = await lockOrder(client, p.order_id);
  if (current === null) return reject(p.order_id, SYNC_ERROR_CODES.orderNotFound);
  if (current.status === "paid") return reject(p.order_id, SYNC_ERROR_CODES.orderAlreadyPaid);
  const line = lineFromCommand(p.order_id, p.line);
  if (line.lineTotalVnd.toString() !== p.client_line_total_vnd) {
    return reject(p.order_id, SYNC_ERROR_CODES.orderTotalMismatch);
  }
  const totalVnd = computeOrderTotal([...(await readLines(client, p.order_id)), line]);
  const order = { ...current, totalVnd, version: current.version + 1, updatedAt: now };
  await insertLine(client, line);
  await updateOrder(client, order);
  return {
    status: "accepted",
    orderId: order.id,
    changes: [
      { entity: "order_line", data: lineToWire(line) },
      { entity: "order", data: orderToWire(order) },
    ],
  };
}

async function payOrder(client: PoolClient, p: PayOrderPayload, now: number): Promise<HandlerOutcome> {
  const current = await lockOrder(client, p.order_id);
  if (current === null) return reject(p.order_id, SYNC_ERROR_CODES.orderNotFound);
  if (current.status === "paid") return reject(p.order_id, SYNC_ERROR_CODES.orderAlreadyPaid);
  // Another till may have added a line after this till printed the bill: the customer
  // paid a different amount than the order is now worth, which a person has to resolve.
  if (current.totalVnd.toString() !== p.client_total_vnd) {
    return reject(p.order_id, SYNC_ERROR_CODES.orderTotalMismatch);
  }
  const order: OrderRow = { ...current, status: "paid", version: current.version + 1, updatedAt: now };
  await updateOrder(client, order);
  await bumpDayTotal(client, order.businessDate, { orders: 0, paid: 1, paidVnd: order.totalVnd });
  return { status: "accepted", orderId: order.id, changes: [{ entity: "order", data: orderToWire(order) }] };
}

export function commandOrderId(command: CommandWire): string {
  return command.payload.order_id;
}

export async function handleOrderCommand(
  client: PoolClient,
  deviceId: string,
  command: CommandWire,
  now: number,
): Promise<HandlerOutcome> {
  switch (command.type) {
    case "order.create":
      return createOrder(client, deviceId, command.payload, now);
    case "order.add_line":
      return addLine(client, command.payload, now);
    case "order.pay":
      return payOrder(client, command.payload, now);
    default:
      return reject(commandOrderId(command), SYNC_ERROR_CODES.unknownCommandType);
  }
}
