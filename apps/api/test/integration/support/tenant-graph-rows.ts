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
}

const named = () => ({ name: "x" });

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
  dining_table: { parent: { column: "area_id", table: "area" }, values: named },
  membership: {
    parent: { column: "app_user_id", table: "app_user" },
    values: () => ({ account_id: freshAccount }),
  },
  organization: { values: named },
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
  return { sql: `INSERT INTO ${table} (${columns}) VALUES (${expressions.join(", ")})`, values };
}
