import { newId } from "@fnb/db";
import type { RowSpec, Sql } from "./tenant-graph-rows";

const aDevice: Sql = { sql: "(SELECT id FROM device ORDER BY id LIMIT 1)" };
const aStaff: Sql = { sql: "(SELECT id FROM staff ORDER BY id LIMIT 1)" };
const BUSINESS_DATE = "2026-10-20";

// A till numbers its orders once each, so every call takes the next number.
const nextDeviceOrderNo: Sql = {
  sql: "(SELECT coalesce(max(device_order_no), 0) + 1 FROM sales_order)",
};

// A refund amount and a void record hang off one line of their own order, and a line has
// at most one refund amount, so each call gets a fresh line on a draft order (a closed
// order refuses new rows under it).
const FRESH_LINE =
  "fresh_line AS (INSERT INTO sales_order_line (id, tenant_id, order_id, position, line_type, " +
  "name_snapshot, unit_price, quantity, tax_rate_bp, price_source) " +
  "SELECT gen_random_uuid(), tenant_id, id, 0, 'item', 'x', 0, 1, 0, 'base' FROM sales_order " +
  "WHERE status = 'draft' ORDER BY id LIMIT 1 RETURNING id, order_id)";
const freshLine = {
  order_id: { sql: "(SELECT order_id FROM fresh_line)" },
  line_id: { sql: "(SELECT id FROM fresh_line)" },
};

// A till has one sync state, so each call needs a till of its own.
const FRESH_DEVICE =
  "fresh_device AS (INSERT INTO device (id, tenant_id, branch_id, name) " +
  "SELECT gen_random_uuid(), tenant_id, id, 'x' FROM branch ORDER BY id LIMIT 1 RETURNING id)";

/** RowSpecs of the order and sync tables, merged into the tenant graph's ROWS. */
export const ORDER_AND_SYNC_ROWS = {
  applied_command: {
    parent: { column: "device_id", table: "device" },
    values: () => ({
      command_id: newId(),
      device_seq: { sql: "(SELECT coalesce(max(device_seq), 0) + 1 FROM applied_command)" },
      type: "order.save_draft",
      status: "accepted",
      result: "{}",
    }),
  },
  // No parent column: its organization is its only parent, and the approval it uses is
  // named without a foreign key.
  approval_use: { values: () => ({ approval_id: newId(), command_id: newId() }) },
  change_log: {
    parent: { column: "branch_id", table: "branch" },
    values: () => ({ entity: "order", entity_id: newId(), snapshot: "{}" }),
  },
  // No parent column: its only parent is a till, and the graph's till already has its
  // state. The cross-tenant key is checked by the sync ledger test instead.
  device_sync_state: {
    values: () => ({ device_id: { sql: "(SELECT id FROM fresh_device)" }, last_seq: 0 }),
    with: FRESH_DEVICE,
  },
  line_void_record: {
    parent: { column: "staff_id", table: "staff" },
    values: () => ({
      ...freshLine,
      quantity: "1",
      from_unsent: "1",
      from_sent: "0",
      reason_code: "x",
    }),
    with: FRESH_LINE,
  },
  payment: {
    parent: { column: "order_id", table: "sales_order" },
    values: () => ({ method: "cash", amount: 0, received_by_staff_id: aStaff }),
  },
  refund_line_amount: {
    parent: { column: "sold_line_id", table: "sales_order_line" },
    values: () => ({
      ...freshLine,
      gross: 0,
      discount_allocated: 0,
      tax: 0,
      service_charge: 0,
      service_charge_tax: 0,
    }),
    with: FRESH_LINE,
  },
  sales_order: {
    parent: { column: "branch_id", table: "branch" },
    values: () => ({
      device_id: aDevice,
      status: "draft",
      service_type: "takeaway",
      business_date: BUSINESS_DATE,
      device_order_no: nextDeviceOrderNo,
      charge_profile: "{}",
    }),
  },
  sales_order_line: {
    parent: { column: "order_id", table: "sales_order" },
    values: () => ({
      position: 0,
      line_type: "item",
      name_snapshot: "x",
      unit_price: 0,
      quantity: "1",
      tax_rate_bp: 0,
      price_source: "base",
    }),
  },
  shift: {
    parent: { column: "branch_id", table: "branch" },
    values: () => ({
      status: "open",
      opened_by_staff_id: aStaff,
      opening_cash: 0,
      business_date: BUSINESS_DATE,
    }),
  },
} satisfies Record<string, RowSpec>;
