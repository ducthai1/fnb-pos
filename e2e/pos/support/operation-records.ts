import { withTenant } from "@fnb/db";
import type pg from "pg";

/** The voids the server recorded on an order, with who approved them. */
export async function voidsOfOrder(pool: pg.Pool, tenantId: string, orderId: string) {
  return withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query<{
      from_sent: string;
      from_unsent: string;
      reason_code: string;
      approval_id: string | null;
      approved_by_staff_id: string | null;
    }>(
      "SELECT from_sent::text, from_unsent::text, reason_code, approval_id, approved_by_staff_id " +
        "FROM line_void_record WHERE order_id = $1 ORDER BY created_at",
      [orderId],
    );
    return rows;
  });
}

/** Every kitchen ticket line of an order, by kind, with its units. */
export async function ticketLinesOfOrder(pool: pg.Pool, tenantId: string, orderId: string) {
  return withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query<{ kind: string; quantity: string }>(
      "SELECT kind, quantity::text AS quantity FROM kitchen_ticket_line WHERE order_id = $1 " +
        "ORDER BY created_at, kind",
      [orderId],
    );
    return rows;
  });
}

/** The approvals given on a till, each with what it was for and whether a command used it. */
export async function approvalsOfTill(pool: pg.Pool, tenantId: string, deviceId: string) {
  return withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query<{
      action_key: string;
      payload: Record<string, unknown>;
      used: boolean;
    }>(
      "SELECT a.action_key, a.payload, EXISTS (SELECT 1 FROM approval_use u " +
        "WHERE u.approval_id = a.id) AS used FROM approval_log a WHERE a.device_id = $1 " +
        "ORDER BY a.created_at",
      [deviceId],
    );
    return rows;
  });
}

/** The cash the server put in and took out of a shift's drawer by sales and refunds. */
export async function cashPaymentsOfShift(pool: pg.Pool, tenantId: string, shiftId: string) {
  return withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query<{ total: string | null }>(
      "SELECT sum(amount)::text AS total FROM payment WHERE shift_id = $1 AND method = 'cash'",
      [shiftId],
    );
    return BigInt(rows[0]?.total ?? "0");
  });
}

/** The till's refunds of a sale, with their payouts. */
export async function refundsOfSale(pool: pg.Pool, tenantId: string, saleId: string) {
  return withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query<{
      id: string;
      status: string;
      paid: string;
      shift_id: string | null;
    }>(
      "SELECT o.id, o.status, o.shift_id, (SELECT sum(p.amount)::text FROM payment p " +
        "WHERE p.order_id = o.id) AS paid FROM sales_order o WHERE o.refund_of_order_id = $1",
      [saleId],
    );
    return rows.map((row) => ({ ...row, paid: BigInt(row.paid) }));
  });
}

/** The till's shifts as the server closed them, oldest first. */
export async function shiftsOfTill(pool: pg.Pool, tenantId: string, deviceId: string) {
  return withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query<{
      id: string;
      status: string;
      counted_cash: string | null;
      expected_cash: string | null;
      difference: string | null;
      close_approval_id: string | null;
    }>(
      "SELECT id, status, counted_cash::text, expected_cash::text, difference::text, " +
        "close_approval_id FROM shift WHERE device_id = $1 ORDER BY created_at",
      [deviceId],
    );
    return rows;
  });
}

/** The cash moves of a shift, oldest first, with the approval each used. */
export async function cashMovesOfShift(pool: pg.Pool, tenantId: string, shiftId: string) {
  return withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query<{
      kind: string;
      amount: string;
      reason: string;
      approval_id: string | null;
    }>(
      "SELECT kind, amount::text, reason, approval_id FROM cash_move WHERE shift_id = $1 " +
        "ORDER BY created_at",
      [shiftId],
    );
    return rows;
  });
}
