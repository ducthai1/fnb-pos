import { type Vnd, computeOrderTotals } from "@fnb/domain";
import type { StoredTableOrder } from "../table-order/stored-table-order";
import type { FloorOccupancy, FloorTable } from "./floor-occupancy";
import { type ShownTableStatus, shownStatusOf } from "./shown-table-status";

export interface FloorTableView {
  readonly id: string;
  readonly areaId: string;
  readonly name: string;
  readonly seats: number;
  readonly status: ShownTableStatus;
  readonly orderId: string | null;
  readonly openedAt: string | null;
  /** The domain's amount due of the order at the table, when the till holds that order. */
  readonly amountDue: Vnd | null;
}

function amountDueOf(order: StoredTableOrder): Vnd | null {
  try {
    const totals = computeOrderTotals(
      { lines: order.lines, serviceType: "dine_in" },
      order.chargeProfile,
    );
    return totals.amountDue;
  } catch {
    return null;
  }
}

function viewOf(
  table: FloorTable,
  order: StoredTableOrder | null,
  preBilled: ReadonlySet<string>,
): FloorTableView {
  const base = { id: table.id, areaId: table.areaId, name: table.name, seats: table.seats };
  if (order === null) {
    return {
      ...base,
      status: table.status,
      orderId: table.orderId,
      openedAt: table.openedAt,
      amountDue: null,
    };
  }
  const status = shownStatusOf(order, preBilled);
  // The server's openedAt belongs to its order; a newer order of the till has none yet.
  const openedAt = table.orderId === order.orderId ? table.openedAt : null;
  return { ...base, status, orderId: order.orderId, openedAt, amountDue: amountDueOf(order) };
}

/**
 * The floor as the till should show it: the plan and the server's statuses as of the last
 * read, corrected by the orders the till holds, which are newer (its own commands not yet
 * sent, and what the change feed brought since): an order this till sees seated at a table
 * shows there, and one it sees paid, cancelled or moved no longer holds the table the
 * server named. A table whose order the till has never held keeps the server's status.
 */
export function floorTablesView(
  occupancy: FloorOccupancy,
  orders: readonly StoredTableOrder[],
  preBilled: ReadonlySet<string>,
): FloorTableView[] {
  const byId = new Map(orders.map((order) => [order.orderId, order]));
  const seated = new Map<string, StoredTableOrder>();
  for (const order of orders) {
    if (order.status === "draft" && order.tableId !== null) seated.set(order.tableId, order);
  }
  return occupancy.tables.map((table) => {
    const local = seated.get(table.id);
    if (local !== undefined) return viewOf(table, local, preBilled);
    const named = table.orderId === null ? undefined : byId.get(table.orderId);
    if (named === undefined) return viewOf(table, null, preBilled);
    // The till holds the order the server named, and sees it elsewhere now: the table is free.
    return { ...viewOf(table, null, preBilled), status: "free", orderId: null, openedAt: null };
  });
}
