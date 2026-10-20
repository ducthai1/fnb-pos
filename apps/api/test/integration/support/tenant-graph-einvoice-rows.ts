import type { RowSpec, Sql } from "./tenant-graph-rows";

const anAppUser: Sql = { sql: "(SELECT id FROM app_user ORDER BY id LIMIT 1)" };

// A branch closes a day once, so each call closes the day after the latest closed one.
const nextOpenDay: Sql = {
  sql: "(SELECT coalesce(max(business_date), DATE '2026-01-01') + 1 FROM day_close)",
};

// An order has one invoice, so each call invoices a draft order of its own.
const FRESH_ORDER =
  "fresh_order AS (INSERT INTO sales_order (id, tenant_id, branch_id, device_id, status, " +
  "service_type, business_date, device_order_no, charge_profile) " +
  "SELECT gen_random_uuid(), tenant_id, branch_id, id, 'draft', 'takeaway', '2026-10-20', " +
  "(SELECT coalesce(max(device_order_no), 0) + 1 FROM sales_order), '{}' " +
  "FROM device ORDER BY id LIMIT 1 RETURNING id)";

/** RowSpecs of the invoice tables, merged into the tenant graph's ROWS. */
export const EINVOICE_ROWS = {
  einvoice: {
    parent: { column: "branch_id", table: "branch" },
    values: () => ({
      order_id: { sql: "(SELECT id FROM fresh_order)" },
      business_date: "2026-10-20",
      next_attempt_at: new Date(),
      provider: "fake",
      regime_version: "nd254-tt91",
      template_symbol: "1C26MAA",
      seller: "{}",
      sold_at: new Date(),
      amounts: "{}",
    }),
    with: FRESH_ORDER,
  },
  einvoice_daily_batch: {
    parent: { column: "branch_id", table: "branch" },
    values: () => ({
      business_date: "2026-10-20",
      provider: "fake",
      regime_version: "nd254-tt91",
      seller: "{}",
      invoice_count: 0,
      next_attempt_at: new Date(),
    }),
  },
  day_close: {
    parent: { column: "branch_id", table: "branch" },
    values: () => ({
      business_date: nextOpenDay,
      closed_by_app_user_id: anAppUser,
      closed_at: new Date(),
      summary: "{}",
    }),
  },
} satisfies Record<string, RowSpec>;
