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
