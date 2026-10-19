import { randomBytes } from "node:crypto";
import { newId } from "@fnb/db";
import type { TenantGraph, TenantTable } from "./tenant-graph";
import { ORDER_AND_SYNC_ROWS } from "./tenant-graph-order-rows";

/** A SQL expression evaluated inside the inserting transaction, instead of a parameter. */
export interface Sql {
  sql: string;
}

export interface RowSpec {
  /** The parent key the cross-tenant test points at another tenant. */
  parent?: { column: string; table: TenantTable };
  /** Further required columns. Values unique per table must be fresh on every call. */
  values: () => Record<string, unknown>;
  /** A data-modifying CTE run first, for a co-parent that must be new on every call. */
  with?: string;
}

const named = () => ({ name: "x" });

/** Stands in for a stored token or code hash; fresh on every call, as those are unique. */
export const randomSha256Hex = () => randomBytes(32).toString("hex");

// Any app_user of the inserting tenant, so only the parent column under test can be wrong.
const anAppUser: Sql = { sql: "(SELECT id FROM app_user ORDER BY id LIMIT 1)" };
const aDevice: Sql = { sql: "(SELECT id FROM device ORDER BY id LIMIT 1)" };
const aRole: Sql = { sql: "(SELECT id FROM role ORDER BY id LIMIT 1)" };

// A staff member is assigned to a branch once, so a second assignment needs a new branch.
const FRESH_BRANCH =
  "fresh_branch AS (INSERT INTO branch (id, tenant_id, brand_id, name) " +
  "SELECT gen_random_uuid(), tenant_id, id, 'x' FROM brand ORDER BY id LIMIT 1 RETURNING id)";

// Rows unique per (parent, co-parent) need a co-parent that is new on every call.
const FRESH_GROUP =
  "fresh_group AS (INSERT INTO modifier_group (id, tenant_id, name, min_select, max_select) " +
  "SELECT gen_random_uuid(), id, 'x', 0, 1 FROM organization LIMIT 1 RETURNING id)";
const FRESH_VARIANT =
  "fresh_variant AS (INSERT INTO product_variant (id, tenant_id, product_id, name) " +
  "SELECT gen_random_uuid(), tenant_id, id, 'x' FROM product ORDER BY id LIMIT 1 RETURNING id)";
const FRESH_PRODUCT =
  "fresh_product AS (INSERT INTO product (id, tenant_id, brand_id, kind, name, pricing_mode) " +
  "SELECT gen_random_uuid(), tenant_id, id, 'retail_item', 'x', 'fixed' FROM brand ORDER BY id LIMIT 1 RETURNING id)";
const aBranch: Sql = { sql: "(SELECT id FROM branch ORDER BY id LIMIT 1)" };
const aProduct = { kind: "prepared_drink", name: "x", pricing_mode: "fixed" };

// A membership needs an account of its own: one account belongs to an organization once.
const freshAccount: Sql = {
  sql: "fnb_auth.create_account(gen_random_uuid(), 'x-' || gen_random_uuid() || '@example.test', NULL, 'x', now())",
};

const ROWS: Record<TenantTable, RowSpec> = {
  ...ORDER_AND_SYNC_ROWS,
  app_user: { values: () => ({ display_name: "x" }) },
  approval_log: {
    parent: { column: "branch_id", table: "branch" },
    values: () => ({
      action_key: "refund",
      requested_by_staff_id: newId(),
      approved_by_staff_id: newId(),
      device_id: aDevice,
    }),
  },
  audit_log: {
    values: () => ({ actor_kind: "system", action: "x", entity_kind: "x", entity_id: newId() }),
  },
  config_value: {
    parent: { column: "scope_id", table: "device" },
    values: () => ({ scope_kind: "device", key: `k${newId()}`, value: "true" }),
  },
  area: { parent: { column: "branch_id", table: "branch" }, values: named },
  branch: { parent: { column: "brand_id", table: "brand" }, values: named },
  brand: { values: named },
  category: { parent: { column: "brand_id", table: "brand" }, values: named },
  combo_slot: {
    parent: { column: "product_id", table: "product" },
    values: () => ({ name: "x", min_select: 0, max_select: 1 }),
  },
  combo_slot_option: {
    parent: { column: "combo_slot_id", table: "combo_slot" },
    values: () => ({ product_id: { sql: "(SELECT id FROM fresh_product)" } }),
    with: FRESH_PRODUCT,
  },
  device: { parent: { column: "branch_id", table: "branch" }, values: named },
  device_credential: {
    parent: { column: "device_id", table: "device" },
    values: () => ({ token_hash: randomSha256Hex() }),
  },
  device_pairing_code: {
    parent: { column: "branch_id", table: "branch" },
    values: () => ({
      code_hash: randomSha256Hex(),
      created_by_app_user_id: anAppUser,
      expires_at: new Date(),
    }),
  },
  dining_table: { parent: { column: "area_id", table: "area" }, values: named },
  modifier_group: { values: () => ({ name: "x", min_select: 0, max_select: 1 }) },
  modifier_group_variant_rule: {
    parent: { column: "modifier_group_id", table: "modifier_group" },
    values: () => ({ variant_id: { sql: "(SELECT id FROM fresh_variant)" } }),
    with: FRESH_VARIANT,
  },
  modifier_option: {
    parent: { column: "modifier_group_id", table: "modifier_group" },
    values: named,
  },
  membership: {
    parent: { column: "app_user_id", table: "app_user" },
    values: () => ({ account_id: freshAccount, role_id: aRole }),
  },
  organization: { values: named },
  price_list: { parent: { column: "brand_id", table: "brand" }, values: named },
  price_list_item: {
    parent: { column: "price_list_id", table: "price_list" },
    values: () => ({
      scope_kind: "global",
      effect_kind: "percent_off",
      percent_off_bp: 1000,
      rounding: "half-up",
    }),
  },
  product: { parent: { column: "brand_id", table: "brand" }, values: () => aProduct },
  product_availability: {
    parent: { column: "product_id", table: "product" },
    values: () => ({ branch_id: aBranch, channel_key: `c${newId()}` }),
  },
  product_modifier_group: {
    parent: { column: "product_id", table: "product" },
    values: () => ({ modifier_group_id: { sql: "(SELECT id FROM fresh_group)" } }),
    with: FRESH_GROUP,
  },
  product_variant: { parent: { column: "product_id", table: "product" }, values: named },
  role: { values: named },
  staff: {
    parent: { column: "role_id", table: "role" },
    values: () => ({ display_name: "x", pin_hash: "x" }),
  },
  staff_branch: {
    parent: { column: "staff_id", table: "staff" },
    values: () => ({ branch_id: { sql: "(SELECT id FROM fresh_branch)" } }),
    with: FRESH_BRANCH,
  },
  staff_session: {
    parent: { column: "staff_id", table: "staff" },
    values: () => ({ device_id: aDevice, token_hash: randomSha256Hex(), expires_at: new Date() }),
  },
  station: { parent: { column: "branch_id", table: "branch" }, values: named },
};

/** Tables that point at a parent row other than their organization. */
export const CHILD_TABLES = (Object.keys(ROWS) as TenantTable[])
  .filter((table) => ROWS[table].parent !== undefined)
  .sort();

const isSql = (value: unknown): value is Sql =>
  typeof value === "object" && value !== null && "sql" in value;

/**
 * A parameterized INSERT of one row into `table` with the given tenant_id, whose parent
 * key is taken from `parents`. An organization row is its own tenant, so its id is the
 * tenant id.
 */
export function insertRow(
  table: TenantTable,
  tenantId: string,
  parents: TenantGraph,
): { sql: string; values: unknown[] } {
  const spec = ROWS[table];
  const cells: Record<string, unknown> = {
    id: table === "organization" ? tenantId : newId(),
    tenant_id: tenantId,
    ...spec.values(),
  };
  if (spec.parent !== undefined) cells[spec.parent.column] = parents.ids[spec.parent.table];
  const values: unknown[] = [];
  const expressions = Object.values(cells).map((cell) => {
    if (isSql(cell)) return cell.sql;
    values.push(cell);
    return `$${values.length}`;
  });
  const columns = Object.keys(cells).join(", ");
  const prefix = spec.with === undefined ? "" : `WITH ${spec.with} `;
  const insert = `INSERT INTO ${table} (${columns}) VALUES (${expressions.join(", ")})`;
  return { sql: prefix + insert, values };
}
