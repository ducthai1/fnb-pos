import { quantityFromThousandths, vnd } from "../shared/domain";
import type { OrderLineRow, OrderRow, OrderStatus } from "../shared/order-rows";
import type { SqlRow, SqlValue } from "./sqlite-driver";

// Both engines hand INTEGER columns back as JS numbers (node:sqlite throws past 2^53 rather
// than losing digits), so money is widened to bigint here, at the single read boundary.
function int(row: SqlRow, column: string): bigint {
  const value = row[column];
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  throw new Error(`column ${column} is not an integer: ${String(value)}`);
}

function text(row: SqlRow, column: string): string {
  const value = row[column];
  if (typeof value !== "string") throw new Error(`column ${column} is not text`);
  return value;
}

export function orderParams(row: OrderRow): SqlValue[] {
  return [
    row.id,
    row.deviceId,
    row.businessDate,
    row.status,
    row.totalVnd,
    row.version,
    row.updatedAt,
  ];
}

export function lineParams(row: OrderLineRow): SqlValue[] {
  return [
    row.id,
    row.orderId,
    row.itemId,
    row.name,
    row.qty,
    row.unitPriceVnd,
    row.lineTotalVnd,
  ];
}

export function orderFromSql(row: SqlRow): OrderRow {
  return {
    id: text(row, "id"),
    deviceId: text(row, "device_id"),
    businessDate: text(row, "business_date"),
    status: text(row, "status") as OrderStatus,
    totalVnd: vnd(int(row, "total_vnd")),
    version: Number(int(row, "version")),
    updatedAt: Number(int(row, "updated_at")),
  };
}

export function lineFromSql(row: SqlRow): OrderLineRow {
  return {
    id: text(row, "id"),
    orderId: text(row, "order_id"),
    itemId: text(row, "item_id"),
    name: text(row, "name"),
    qty: quantityFromThousandths(int(row, "qty_thousandths")),
    unitPriceVnd: vnd(int(row, "unit_price_vnd")),
    lineTotalVnd: vnd(int(row, "line_total_vnd")),
  };
}

export function numberOf(row: SqlRow | undefined, column: string): number {
  return row === undefined ? 0 : Number(int(row, column));
}
