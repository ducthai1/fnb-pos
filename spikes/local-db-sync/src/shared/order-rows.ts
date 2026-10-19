import { type Quantity, type Vnd, addVnd, multiplyVndByQuantity } from "./domain";

export type OrderStatus = "open" | "paid";

/** One row of `orders`, identical on the till (SQLite) and the server (Postgres). */
export interface OrderRow {
  id: string;
  deviceId: string;
  businessDate: string;
  status: OrderStatus;
  totalVnd: Vnd;
  version: number;
  updatedAt: number;
}

export interface OrderLineRow {
  id: string;
  orderId: string;
  itemId: string;
  name: string;
  qty: Quantity;
  unitPriceVnd: Vnd;
  lineTotalVnd: Vnd;
}

export interface OrderSnapshot {
  order: OrderRow;
  lines: OrderLineRow[];
}

/**
 * Both sides compute totals with the same domain functions; the server recomputes and
 * rejects a command whose client total disagrees instead of trusting the till.
 */
export function computeLineTotal(unitPriceVnd: Vnd, qty: Quantity): Vnd {
  return multiplyVndByQuantity(unitPriceVnd, qty, "half-up");
}

export function computeOrderTotal(lines: readonly Pick<OrderLineRow, "lineTotalVnd">[]): Vnd {
  return addVnd(...lines.map((line) => line.lineTotalVnd));
}
