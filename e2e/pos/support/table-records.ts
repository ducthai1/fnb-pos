import { withTenant } from "@fnb/db";
import type pg from "pg";
import type { PosStack } from "../../support/global-setup-start-pos-stack";
import { backoffice } from "./backoffice-calls";

/** A floor of one area with `names` tables, set up in the backoffice; returns their ids. */
export async function floorOf(
  stack: PosStack,
  ids: { area: string; tables: readonly string[] },
  areaName: string,
  names: readonly string[],
  branchId = stack.branchId,
) {
  const area = { version: null, branchId, name: areaName, sortOrder: 0 };
  await backoffice(stack, "PUT", `/floor/areas/${ids.area}`, area, 201);
  for (const [index, name] of names.entries()) {
    const table = {
      version: null,
      areaId: ids.area,
      name,
      x: 100 * index,
      y: 0,
      width: 80,
      height: 80,
      shape: "rectangle",
      seats: 4,
      sortOrder: index,
    };
    await backoffice(stack, "PUT", `/floor/tables/${ids.tables[index]}`, table, 201);
  }
}

export interface StoredTableOrder {
  id: string;
  status: string;
  tableId: string | null;
  tableName: string | null;
  preBillCurrent: boolean;
  paid: bigint;
}

/** The orders the server stored for one till, with their table and what was paid. */
export async function tableOrdersOfTill(pool: pg.Pool, tenantId: string, deviceId: string) {
  return withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query<{
      id: string;
      status: string;
      table_id: string | null;
      table_name_snapshot: string | null;
      pre_bill_current: boolean | null;
      paid: string | null;
    }>(
      "SELECT o.id, o.status, o.table_id, o.table_name_snapshot, " +
        "o.pre_bill_printed_version = o.version AS pre_bill_current, " +
        "(SELECT sum(p.amount) FROM payment p WHERE p.order_id = o.id) AS paid " +
        "FROM sales_order o WHERE o.device_id = $1 ORDER BY o.device_order_no",
      [deviceId],
    );
    return rows.map((row): StoredTableOrder => ({
      id: row.id,
      status: row.status,
      tableId: row.table_id,
      tableName: row.table_name_snapshot,
      preBillCurrent: row.pre_bill_current === true,
      paid: BigInt(row.paid ?? "0"),
    }));
  });
}

/** Each kitchen ticket of the order, oldest first, with the products and units it carried. */
export async function ticketsOfOrder(pool: pg.Pool, tenantId: string, orderId: string) {
  return withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query<{
      ticket_id: string;
      product_id: string;
      quantity: string;
    }>(
      "SELECT k.ticket_id, l.product_id, k.quantity::text AS quantity FROM kitchen_ticket_line k " +
        "JOIN sales_order_line l ON l.id = k.line_id JOIN kitchen_ticket t ON t.id = k.ticket_id " +
        "WHERE k.order_id = $1 AND k.kind = 'new' ORDER BY t.created_at, t.id, l.product_id",
      [orderId],
    );
    const tickets = new Map<string, { productId: string; quantity: string }[]>();
    for (const row of rows) {
      const lines = tickets.get(row.ticket_id) ?? [];
      lines.push({ productId: row.product_id, quantity: row.quantity });
      tickets.set(row.ticket_id, lines);
    }
    return [...tickets.values()];
  });
}

/** The units of each product on the order's items, as the server stores them. */
export async function itemsOfOrder(pool: pg.Pool, tenantId: string, orderId: string) {
  return withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query<{ product_id: string; units: string }>(
      "SELECT product_id, sum(quantity)::text AS units FROM sales_order_line " +
        "WHERE order_id = $1 AND line_type = 'item' AND parent_line_id IS NULL " +
        "AND reverses_line_id IS NULL GROUP BY product_id ORDER BY product_id",
      [orderId],
    );
    return Object.fromEntries(rows.map((row) => [row.product_id, row.units]));
  });
}

/** The commands of one till the server refused, oldest first, with the code it refused with. */
export async function refusalsOfTill(pool: pg.Pool, tenantId: string, deviceId: string) {
  return withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query<{ type: string; code: string }>(
      "SELECT type, code FROM applied_command WHERE device_id = $1 AND status = 'rejected' " +
        "ORDER BY device_seq",
      [deviceId],
    );
    return rows.map((row) => ({ type: row.type, code: row.code }));
  });
}

/**
 * Cancels the drafts still open at `tableIds`, which a spec's guests leave behind: the stack is
 * shared, and a draft left open holds up the close of the branch's day for the specs after it.
 * Written straight to the database, since no till of this spec is left to cancel them.
 */
export async function abandonDraftsAt(
  pool: pg.Pool,
  tenantId: string,
  tableIds: readonly string[],
) {
  return withTenant(pool, tenantId, async (client) => {
    const { rowCount } = await client.query(
      "UPDATE sales_order SET status = 'cancelled' WHERE status = 'draft' AND table_id = ANY($1::uuid[])",
      [tableIds],
    );
    return rowCount ?? 0;
  });
}
