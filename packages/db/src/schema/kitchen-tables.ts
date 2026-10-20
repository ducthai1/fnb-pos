import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { newId } from "../ids/new-id";
import { quantity } from "./order-tables";

const at = (name: string) => timestamp(name, { withTimezone: true });

/** A kitchen ticket a till printed; append-only, and its id was made on the till. */
export const kitchenTicket = pgTable("kitchen_ticket", {
  id: uuid("id").primaryKey().$defaultFn(newId),
  tenantId: uuid("tenant_id").notNull(),
  orderId: uuid("order_id").notNull(),
  deviceId: uuid("device_id").notNull(),
  staffId: uuid("staff_id").notNull(),
  commandId: uuid("command_id").notNull(),
  payload: jsonb("payload").notNull().default({}),
  createdAt: at("created_at").notNull().defaultNow(),
});

/** Units of one order line a station was told about on a ticket; append-only. */
export const kitchenTicketLine = pgTable("kitchen_ticket_line", {
  id: uuid("id").primaryKey().$defaultFn(newId),
  tenantId: uuid("tenant_id").notNull(),
  ticketId: uuid("ticket_id").notNull(),
  orderId: uuid("order_id").notNull(),
  lineId: uuid("line_id").notNull(),
  stationId: uuid("station_id").notNull(),
  kind: text("kind").notNull(),
  quantity: quantity("quantity").notNull(),
  note: text("note"),
  detail: jsonb("detail").notNull().default({}),
  createdAt: at("created_at").notNull().defaultNow(),
});

export const kitchenTables = { kitchenTicket, kitchenTicketLine };
