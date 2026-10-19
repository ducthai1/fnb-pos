import type { PoolClient } from "pg";
import { quantityFromThousandths, vnd } from "../shared/domain";
import {
  type OrderLineRow,
  type OrderRow,
  type OrderStatus,
  computeLineTotal,
} from "../shared/order-rows";
import { snapshotToWire } from "../shared/order-wire-codec";
import type { NewLineWire, OrderSnapshotWire } from "../shared/sync-wire-types";

// node-postgres returns int8 as text (it cannot fit every bigint in a JS number), which is
// exactly what money needs: it goes straight into BigInt without a float in between.
type PgRow = Record<string, string | number | null>;

function orderFromPg(row: PgRow): OrderRow {
  return {
    id: String(row["id"]),
    deviceId: String(row["device_id"]),
    businessDate: String(row["business_date"]),
    status: row["status"] as OrderStatus,
    totalVnd: vnd(BigInt(String(row["total_vnd"]))),
    version: Number(row["version"]),
    updatedAt: Number(row["updated_at"]),
  };
}

function lineFromPg(row: PgRow): OrderLineRow {
  return {
    id: String(row["id"]),
    orderId: String(row["order_id"]),
    itemId: String(row["item_id"]),
    name: String(row["name"]),
    qty: quantityFromThousandths(BigInt(String(row["qty_thousandths"]))),
    unitPriceVnd: vnd(BigInt(String(row["unit_price_vnd"]))),
    lineTotalVnd: vnd(BigInt(String(row["line_total_vnd"]))),
  };
}

/** Line total is recomputed here from price × quantity; the till's figure is only compared. */
export function lineFromCommand(orderId: string, line: NewLineWire): OrderLineRow {
  const qty = quantityFromThousandths(BigInt(line.qty_thousandths));
  const unitPriceVnd = vnd(BigInt(line.unit_price_vnd));
  return {
    id: line.id,
    orderId,
    itemId: line.item_id,
    name: line.name,
    qty,
    unitPriceVnd,
    lineTotalVnd: computeLineTotal(unitPriceVnd, qty),
  };
}

export async function lockOrder(client: PoolClient, orderId: string): Promise<OrderRow | null> {
  const { rows } = await client.query<PgRow>("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [
    orderId,
  ]);
  return rows[0] === undefined ? null : orderFromPg(rows[0]);
}

export async function readLines(client: PoolClient, orderId: string): Promise<OrderLineRow[]> {
  const { rows } = await client.query<PgRow>(
    "SELECT * FROM order_lines WHERE order_id = $1 ORDER BY id",
    [orderId],
  );
  return rows.map(lineFromPg);
}

export async function readSnapshotWire(
  client: PoolClient,
  orderId: string,
): Promise<OrderSnapshotWire | null> {
  const { rows } = await client.query<PgRow>("SELECT * FROM orders WHERE id = $1", [orderId]);
  if (rows[0] === undefined) return null;
  return snapshotToWire({ order: orderFromPg(rows[0]), lines: await readLines(client, orderId) });
}

export async function insertOrder(client: PoolClient, order: OrderRow): Promise<void> {
  await client.query(
    `INSERT INTO orders (id, device_id, business_date, status, total_vnd, version, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      order.id,
      order.deviceId,
      order.businessDate,
      order.status,
      order.totalVnd.toString(),
      order.version,
      order.updatedAt,
    ],
  );
}

export async function updateOrder(client: PoolClient, order: OrderRow): Promise<void> {
  await client.query(
    "UPDATE orders SET status = $2, total_vnd = $3, version = $4, updated_at = $5 WHERE id = $1",
    [order.id, order.status, order.totalVnd.toString(), order.version, order.updatedAt],
  );
}

export async function insertLine(client: PoolClient, line: OrderLineRow): Promise<void> {
  await client.query(
    `INSERT INTO order_lines (id, order_id, item_id, name, qty_thousandths, unit_price_vnd, line_total_vnd)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      line.id,
      line.orderId,
      line.itemId,
      line.name,
      line.qty.toString(),
      line.unitPriceVnd.toString(),
      line.lineTotalVnd.toString(),
    ],
  );
}

export async function bumpDayTotal(
  client: PoolClient,
  businessDate: string,
  delta: { orders: number; paid: number; paidVnd: bigint },
): Promise<void> {
  await client.query(
    `INSERT INTO business_day_total (business_date, order_count, paid_count, paid_vnd)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (business_date) DO UPDATE SET
       order_count = business_day_total.order_count + excluded.order_count,
       paid_count = business_day_total.paid_count + excluded.paid_count,
       paid_vnd = business_day_total.paid_vnd + excluded.paid_vnd`,
    [businessDate, delta.orders, delta.paid, delta.paidVnd.toString()],
  );
}
