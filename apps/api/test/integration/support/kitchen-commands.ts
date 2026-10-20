import { newId, withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { expectStatus } from "./catalog-shop";
import { command } from "./sync-commands";
import type { SyncShop, Till } from "./sync-shop";

export type TicketKind = "new" | "cancel" | "note_changed";

export interface TicketLine {
  lineId: string;
  kind: TicketKind;
  quantity: string;
  note: string | null;
}

export const ticketLine = (
  lineId: string,
  quantity: string,
  kind: TicketKind = "new",
  note: string | null = null,
): TicketLine => ({ lineId, kind, quantity, note });

/** A station of `branchId` (the shop's first branch by default), made through the backoffice. */
export async function kitchenStation(
  app: FastifyInstance,
  s: SyncShop,
  name = "Bar",
  branchId = s.shop.branchId,
): Promise<string> {
  const stationId = newId();
  await expectStatus(
    app.inject({
      method: "PUT",
      url: `/catalog/stations/${stationId}`,
      headers: { cookie: s.shop.managerCookie },
      payload: { version: null, branchId, name },
    }),
    201,
  );
  return stationId;
}

/** order.mark_sent_to_kitchen for one ticket the till printed at `stationId`. */
export const sentToKitchen = (
  till: Till,
  orderId: string,
  stationId: string,
  lines: TicketLine[],
  ticketId = newId(),
) =>
  command(till, "order.mark_sent_to_kitchen", {
    orderId,
    ticketId,
    stations: [{ stationId, lines }],
  });

/** Each line's recorded sent state, as the kitchen layer left it. */
export const sentStateOf = (pool: pg.Pool, tenantId: string, orderId: string) =>
  withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query(
      "SELECT id, sent_quantity::text AS sent, sent_note AS note FROM sales_order_line " +
        "WHERE order_id = $1 AND line_type = 'item' ORDER BY position, id",
      [orderId],
    );
    return rows as { id: string; sent: string; note: string | null }[];
  });

/** Every ticket line recorded for the order, oldest first. */
export const ticketLinesOf = (pool: pg.Pool, tenantId: string, orderId: string) =>
  withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query(
      "SELECT t.ticket_id, t.line_id, t.station_id, t.kind, t.quantity::text AS quantity, " +
        "t.note, t.detail, k.staff_id FROM kitchen_ticket_line t " +
        "JOIN kitchen_ticket k ON k.id = t.ticket_id WHERE t.order_id = $1 ORDER BY t.id",
      [orderId],
    );
    return rows;
  });
