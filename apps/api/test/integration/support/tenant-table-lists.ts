/**
 * Every tenancy table, in the order Postgres sorts their names; the catalog test fails if
 * `public` gains a table missing here.
 */
export const TENANT_TABLES = [
  "app_user",
  "applied_command",
  "approval_log",
  "approval_use",
  "area",
  "audit_log",
  "bank_transaction",
  "branch",
  "brand",
  "cash_move",
  "category",
  "change_log",
  "combo_slot",
  "combo_slot_option",
  "config_value",
  "day_close",
  "device",
  "device_credential",
  "device_pairing_code",
  "device_sync_state",
  "dining_table",
  "einvoice",
  "einvoice_daily_batch",
  "kitchen_ticket",
  "kitchen_ticket_line",
  "line_void_record",
  "membership",
  "modifier_group",
  "modifier_group_variant_rule",
  "modifier_option",
  "organization",
  "payment",
  "payment_intent",
  "payment_webhook_endpoint",
  "price_list",
  "price_list_item",
  "print_job_log",
  "product",
  "product_availability",
  "product_modifier_group",
  "product_variant",
  "refund_line_amount",
  "role",
  "sales_order",
  "sales_order_line",
  "shift",
  "shift_count",
  "staff",
  "staff_branch",
  "staff_session",
  "station",
] as const;

export type TenantTable = (typeof TENANT_TABLES)[number];

/**
 * Evidence tables: the app role may read and add rows, never change or remove them. Each
 * maps to the JSON column the tamper tests try to rewrite; the seeded value is `{}`.
 */
export const APPEND_ONLY_JSON_COLUMN = {
  applied_command: "payload",
  approval_log: "payload",
  approval_use: "payload",
  audit_log: "payload",
  bank_transaction: "raw",
  change_log: "snapshot",
  day_close: "summary",
  kitchen_ticket: "payload",
  kitchen_ticket_line: "detail",
  print_job_log: "payload",
} as const satisfies Partial<Record<TenantTable, string>>;

export const APPEND_ONLY_TABLES = Object.keys(
  APPEND_ONLY_JSON_COLUMN,
) as (keyof typeof APPEND_ONLY_JSON_COLUMN)[];

export const MUTABLE_TENANT_TABLES = TENANT_TABLES.filter(
  (table) => !(APPEND_ONLY_TABLES as readonly string[]).includes(table),
);

/** Rows history points at: the app role archives them and may never delete them. */
export const UNDELETABLE_TABLES = [
  "modifier_option",
  "product",
  "product_variant",
] as const satisfies TenantTable[];

export const DELETABLE_TENANT_TABLES = MUTABLE_TENANT_TABLES.filter(
  (table) => !(UNDELETABLE_TABLES as readonly string[]).includes(table),
);
