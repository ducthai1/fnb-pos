import { drizzleFor, kitchenTicket, kitchenTicketLine, newId } from "@fnb/db";
import type pg from "pg";

export interface KitchenAndPrintSeedIds {
  device: string;
  staff: string;
  station: string;
  sales_order: string;
  sales_order_line: string;
  kitchen_ticket: string;
  kitchen_ticket_line: string;
}

/** One row in every kitchen ticket and print log table, about the graph's draft order. */
export async function seedKitchenAndPrintRows(
  client: pg.PoolClient,
  tenantId: string,
  ids: KitchenAndPrintSeedIds,
): Promise<void> {
  const db = drizzleFor(client);
  await db.insert(kitchenTicket).values({
    id: ids.kitchen_ticket,
    tenantId,
    orderId: ids.sales_order,
    deviceId: ids.device,
    staffId: ids.staff,
    commandId: newId(),
  });
  await db.insert(kitchenTicketLine).values({
    id: ids.kitchen_ticket_line,
    tenantId,
    ticketId: ids.kitchen_ticket,
    orderId: ids.sales_order,
    lineId: ids.sales_order_line,
    stationId: ids.station,
    kind: "new",
    quantity: "1",
  });
}
