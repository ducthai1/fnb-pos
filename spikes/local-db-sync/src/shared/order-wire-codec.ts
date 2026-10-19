import { quantityFromThousandths, vnd } from "./domain";
import type { OrderLineRow, OrderRow, OrderSnapshot } from "./order-rows";
import type { OrderLineWire, OrderSnapshotWire, OrderWire } from "./sync-wire-types";

export function orderToWire(row: OrderRow): OrderWire {
  return {
    id: row.id,
    device_id: row.deviceId,
    business_date: row.businessDate,
    status: row.status,
    total_vnd: row.totalVnd.toString(),
    version: row.version,
    updated_at: row.updatedAt,
  };
}

export function orderFromWire(wire: OrderWire): OrderRow {
  return {
    id: wire.id,
    deviceId: wire.device_id,
    businessDate: wire.business_date,
    status: wire.status,
    totalVnd: vnd(BigInt(wire.total_vnd)),
    version: wire.version,
    updatedAt: wire.updated_at,
  };
}

export function lineToWire(row: OrderLineRow): OrderLineWire {
  return {
    id: row.id,
    order_id: row.orderId,
    item_id: row.itemId,
    name: row.name,
    qty_thousandths: row.qty.toString(),
    unit_price_vnd: row.unitPriceVnd.toString(),
    line_total_vnd: row.lineTotalVnd.toString(),
  };
}

export function lineFromWire(wire: OrderLineWire): OrderLineRow {
  return {
    id: wire.id,
    orderId: wire.order_id,
    itemId: wire.item_id,
    name: wire.name,
    qty: quantityFromThousandths(BigInt(wire.qty_thousandths)),
    unitPriceVnd: vnd(BigInt(wire.unit_price_vnd)),
    lineTotalVnd: vnd(BigInt(wire.line_total_vnd)),
  };
}

export function snapshotFromWire(wire: OrderSnapshotWire): OrderSnapshot {
  return { order: orderFromWire(wire.order), lines: wire.lines.map(lineFromWire) };
}

export function snapshotToWire(snapshot: OrderSnapshot): OrderSnapshotWire {
  return { order: orderToWire(snapshot.order), lines: snapshot.lines.map(lineToWire) };
}
