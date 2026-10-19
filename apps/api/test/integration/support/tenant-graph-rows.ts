import { randomBytes } from "node:crypto";
import { newId } from "@fnb/db";
import type { TenantGraph, TenantTable } from "./tenant-graph";

/** A SQL expression evaluated inside the inserting transaction, instead of a parameter. */
interface Sql {
  sql: string;
}

interface RowSpec {
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

// A staff member is assigned to a branch once, so a second assignment needs a new branch.
const FRESH_BRANCH =
  "fresh_branch AS (INSERT INTO branch (id, tenant_id, brand_id, name) " +
  "SELECT gen_random_uuid(), tenant_id, id, 'x' FROM brand ORDER BY id LIMIT 1 RETURNING id)";

// A membership needs an account of its own: one account belongs to an organization once.
const freshAccount: Sql = {
  sql: "fnb_auth.create_account(gen_random_uuid(), 'x-' || gen_random_uuid() || '@example.test', NULL, 'x', now())",
};

const ROWS: Record<TenantTable, RowSpec> = {
  app_user: { values: () => ({ display_name: "x" }) },
  area: { parent: { column: "branch_id", table: "branch" }, values: named },
  branch: { parent: { column: "brand_id", table: "brand" }, values: named },
  brand: { values: named },
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
  membership: {
    parent: { column: "app_user_id", table: "app_user" },
    values: () => ({ account_id: freshAccount }),
  },
  organization: { values: named },
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
