import { newId } from "@fnb/db";
import { FRESH_LINE, freshLine } from "./tenant-graph-order-rows";
import type { RowSpec, Sql } from "./tenant-graph-rows";

const aDevice: Sql = { sql: "(SELECT id FROM device ORDER BY id LIMIT 1)" };
const aStaff: Sql = { sql: "(SELECT id FROM staff ORDER BY id LIMIT 1)" };

/** RowSpecs of the kitchen ticket and print log tables, merged into the tenant graph's ROWS. */
export const KITCHEN_AND_PRINT_ROWS = {
  kitchen_ticket: {
    parent: { column: "order_id", table: "sales_order" },
    values: () => ({ device_id: aDevice, staff_id: aStaff, command_id: newId() }),
  },
  // Its ticket is named without a foreign key; the line it prints is a fresh one each call.
  kitchen_ticket_line: {
    parent: { column: "station_id", table: "station" },
    values: () => ({ ...freshLine, ticket_id: newId(), kind: "new", quantity: "1" }),
    with: FRESH_LINE,
  },
} satisfies Record<string, RowSpec>;
