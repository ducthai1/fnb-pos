import { withTenant } from "@fnb/db";
import type pg from "pg";

export interface StoredSale {
  id: string;
  status: string;
  deviceOrderNo: number;
  shiftId: string | null;
  paid: bigint;
  payments: number;
}

/** The orders the server stored for one till, with what was paid on each. */
export async function salesOfTill(
  pool: pg.Pool,
  tenantId: string,
  deviceId: string,
): Promise<StoredSale[]> {
  return withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query<{
      id: string;
      status: string;
      device_order_no: string;
      shift_id: string | null;
      paid: string | null;
      payments: string;
    }>(
      "SELECT o.id, o.status, o.device_order_no, o.shift_id, " +
        "(SELECT sum(p.amount) FROM payment p WHERE p.order_id = o.id) AS paid, " +
        "(SELECT count(*) FROM payment p WHERE p.order_id = o.id) AS payments " +
        "FROM sales_order o WHERE o.device_id = $1 ORDER BY o.device_order_no",
      [deviceId],
    );
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      deviceOrderNo: Number(row.device_order_no),
      shiftId: row.shift_id,
      paid: BigInt(row.paid ?? "0"),
      payments: Number(row.payments),
    }));
  });
}

/** The shift the till has not closed, as the server holds it. */
export async function openShiftIdOfTill(pool: pg.Pool, tenantId: string, deviceId: string) {
  return withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      "SELECT id FROM shift WHERE device_id = $1 AND status <> 'closed'",
      [deviceId],
    );
    return rows.map((row) => row.id);
  });
}

/** How many tickets the bar was recorded as sent, and how print jobs came out, for an order. */
export async function printsOfOrder(pool: pg.Pool, tenantId: string, orderId: string) {
  return withTenant(pool, tenantId, async (client) => {
    const tickets = await client.query("SELECT id FROM kitchen_ticket WHERE order_id = $1", [
      orderId,
    ]);
    const jobs = await client.query<{ kind: string; status: string }>(
      "SELECT kind, status FROM print_job_log WHERE order_id = $1 ORDER BY kind",
      [orderId],
    );
    return { tickets: tickets.rowCount ?? 0, jobs: jobs.rows };
  });
}
