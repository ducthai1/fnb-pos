import type pg from "pg";
import type { LocalStore } from "../local-store/local-store";
import { canonicalState } from "../shared/canonical-state";
import type { OrderSnapshot } from "../shared/order-rows";
import { lineFromWire, orderFromWire } from "../shared/order-wire-codec";
import type { OrderLineWire, OrderWire } from "../shared/sync-wire-types";

export interface ServerAudit {
  orders: number;
  lines: number;
  paidOrders: number;
  changeRows: number;
  maxChangeSeq: string;
  /** Each > 0 means some command took effect twice. */
  duplicateChangeRows: number;
  dayOrderCountExcess: number;
  dayPaidCountExcess: number;
  dayPaidVndExcess: string;
  /** Changes of one till whose change_seq order disagrees with that till's device_seq order. */
  changesOutOfDeviceOrder: number;
}

export interface TillAudit {
  commands: number;
  pending: number;
  rejected: number;
  /** Accepted by the server per the till, yet its row is not on the server. */
  lostEffects: number;
  matchesServer: boolean;
  mismatchedOrders: number;
}

const one = async (pool: pg.Pool, sql: string): Promise<string> => {
  const { rows } = await pool.query<{ v: string | null }>(sql);
  return rows[0]?.v ?? "0";
};

export async function readServerSnapshots(pool: pg.Pool): Promise<OrderSnapshot[]> {
  const orders = await pool.query<{ w: OrderWire }>(
    `SELECT json_build_object('id', id, 'device_id', device_id, 'business_date', business_date::text,
       'status', status, 'total_vnd', total_vnd::text, 'version', version, 'updated_at', updated_at) AS w
     FROM orders`,
  );
  const lines = await pool.query<{ w: OrderLineWire }>(
    `SELECT json_build_object('id', id, 'order_id', order_id, 'item_id', item_id, 'name', name,
       'qty_thousandths', qty_thousandths::text, 'unit_price_vnd', unit_price_vnd::text,
       'line_total_vnd', line_total_vnd::text) AS w
     FROM order_lines`,
  );
  const byOrder = new Map<string, OrderSnapshot>();
  for (const { w } of orders.rows) {
    byOrder.set(w.id, { order: orderFromWire(w), lines: [] });
  }
  for (const { w } of lines.rows) byOrder.get(w.order_id)?.lines.push(lineFromWire(w));
  return [...byOrder.values()];
}

export async function auditServer(pool: pg.Pool): Promise<ServerAudit> {
  return {
    orders: Number(await one(pool, "SELECT count(*)::text AS v FROM orders")),
    lines: Number(await one(pool, "SELECT count(*)::text AS v FROM order_lines")),
    paidOrders: Number(await one(pool, "SELECT count(*)::text AS v FROM orders WHERE status = 'paid'")),
    changeRows: Number(await one(pool, "SELECT count(*)::text AS v FROM change_log")),
    maxChangeSeq: await one(pool, "SELECT max(change_seq)::text AS v FROM change_log"),
    duplicateChangeRows: Number(
      await one(
        pool,
        `SELECT coalesce(sum(n - 1), 0)::text AS v FROM
         (SELECT count(*) AS n FROM change_log GROUP BY command_id, entity_id HAVING count(*) > 1) d`,
      ),
    ),
    dayOrderCountExcess: Number(
      await one(pool, "SELECT (SELECT coalesce(sum(order_count), 0) FROM business_day_total) - (SELECT count(*) FROM orders) AS v"),
    ),
    dayPaidCountExcess: Number(
      await one(pool, "SELECT (SELECT coalesce(sum(paid_count), 0) FROM business_day_total) - (SELECT count(*) FROM orders WHERE status = 'paid') AS v"),
    ),
    changesOutOfDeviceOrder: Number(
      await one(
        pool,
        `SELECT count(*)::text AS v FROM (
           SELECT a.device_seq, lag(a.device_seq) OVER (PARTITION BY a.device_id ORDER BY c.change_seq) AS prev
           FROM change_log c JOIN applied_command a USING (command_id)) x
         WHERE prev > device_seq`,
      ),
    ),
    dayPaidVndExcess: await one(
      pool,
      "SELECT ((SELECT coalesce(sum(paid_vnd), 0) FROM business_day_total) - (SELECT coalesce(sum(total_vnd), 0) FROM orders WHERE status = 'paid'))::text AS v",
    ),
  };
}

export async function auditTill(store: LocalStore, server: readonly OrderSnapshot[]): Promise<TillAudit> {
  const serverOrders = new Map(server.map((s) => [s.order.id, s]));
  const serverLines = new Set(server.flatMap((s) => s.lines.map((line) => line.id)));
  const commands = await store.listCommands();
  let lostEffects = 0;
  for (const command of commands.filter((c) => c.status === "accepted")) {
    const order = serverOrders.get(command.payload.order_id);
    const present =
      command.type === "order.create"
        ? order !== undefined
        : command.type === "order.add_line"
          ? serverLines.has(command.payload.line?.id ?? "")
          : order?.order.status === "paid";
    if (!present) lostEffects += 1;
  }
  const local = await store.listOrderSnapshots();
  const serverText = canonicalState(server).split("\n");
  const localText = new Set(canonicalState(local).split("\n"));
  return {
    commands: commands.length,
    pending: commands.filter((c) => c.status === "pending").length,
    rejected: commands.filter((c) => c.status === "rejected").length,
    lostEffects,
    matchesServer: local.length === server.length && serverText.every((t) => localText.has(t)),
    mismatchedOrders: serverText.filter((t) => !localText.has(t)).length + Math.max(0, local.length - server.length),
  };
}
