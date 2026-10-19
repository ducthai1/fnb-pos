import { newId, withTenant } from "@fnb/db";
import type pg from "pg";
import type { TenantGraph } from "./tenant-graph";

export interface SeededOrder {
  orderId: string;
  lineId: string;
  paymentId: string;
}

/**
 * An order rung up as a draft (one line, one payment) and then moved through `path`, the
 * way the server closes one: rows are written while it is a draft, then only its status
 * changes.
 */
export async function orderMovedThrough(
  pool: pg.Pool,
  graph: TenantGraph,
  path: readonly ("paid" | "posted" | "cancelled")[],
): Promise<SeededOrder> {
  const seeded = { orderId: newId(), lineId: newId(), paymentId: newId() };
  await withTenant(pool, graph.tenantId, async (client) => {
    await client.query(
      "INSERT INTO sales_order (id, tenant_id, branch_id, device_id, status, service_type, " +
        "business_date, device_order_no, charge_profile) VALUES ($1, $2, $3, $4, 'draft', " +
        "'takeaway', '2026-10-20', (SELECT coalesce(max(device_order_no), 0) + 1 FROM sales_order), " +
        `'{"pricesIncludeTax": true, "serviceCharge": null}')`,
      [seeded.orderId, graph.tenantId, graph.ids.branch, graph.ids.device],
    );
    await client.query(
      "INSERT INTO sales_order_line (id, tenant_id, order_id, position, line_type, name_snapshot, " +
        "unit_price, quantity, tax_rate_bp, price_source) " +
        "VALUES ($1, $2, $3, 0, 'item', 'Cà phê sữa', 29000, 2, 800, 'base')",
      [seeded.lineId, graph.tenantId, seeded.orderId],
    );
    await client.query(
      "INSERT INTO payment (id, tenant_id, order_id, method, amount, received_by_staff_id) " +
        "VALUES ($1, $2, $3, 'cash', 58000, $4)",
      [seeded.paymentId, graph.tenantId, seeded.orderId, graph.ids.staff],
    );
    for (const status of path) {
      await client.query(
        "UPDATE sales_order SET status = $2, version = version + 1 WHERE id = $1",
        [seeded.orderId, status],
      );
    }
  });
  return seeded;
}
