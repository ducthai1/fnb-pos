import {
  appUser,
  area,
  branch,
  brand,
  device,
  diningTable,
  drizzleFor,
  newId,
  organization,
  withTenant,
} from "@fnb/db";
import type pg from "pg";

/** Every tenancy table; the catalog test fails if `public` gains a table missing here. */
export const TENANT_TABLES = [
  "app_user",
  "area",
  "branch",
  "brand",
  "device",
  "dining_table",
  "organization",
] as const;

export type TenantTable = (typeof TENANT_TABLES)[number];

export interface TenantGraph {
  tenantId: string;
  ids: Record<TenantTable, string>;
}

/** One row in every tenancy table for a fresh tenant, written as the app role through RLS. */
export async function seedTenantGraph(pool: pg.Pool): Promise<TenantGraph> {
  const tenantId = newId();
  const ids: Record<TenantTable, string> = {
    organization: tenantId,
    brand: newId(),
    branch: newId(),
    area: newId(),
    dining_table: newId(),
    device: newId(),
    app_user: newId(),
  };
  await withTenant(pool, tenantId, async (client) => {
    const db = drizzleFor(client);
    await db.insert(organization).values({ id: tenantId, tenantId, name: "Công ty Phở Sáng" });
    await db.insert(brand).values({ id: ids.brand, tenantId, name: "Phở Sáng" });
    await db.insert(branch).values({ id: ids.branch, tenantId, brandId: ids.brand, name: "Q1" });
    await db.insert(area).values({ id: ids.area, tenantId, branchId: ids.branch, name: "Tầng 1" });
    await db
      .insert(diningTable)
      .values({ id: ids.dining_table, tenantId, areaId: ids.area, name: "B01" });
    await db
      .insert(device)
      .values({ id: ids.device, tenantId, branchId: ids.branch, name: "POS 1" });
    await db.insert(appUser).values({ id: ids.app_user, tenantId, displayName: "Thu ngân" });
  });
  return { tenantId, ids };
}

const PARENT: Partial<Record<TenantTable, { column: string; table: TenantTable }>> = {
  branch: { column: "brand_id", table: "brand" },
  area: { column: "branch_id", table: "branch" },
  dining_table: { column: "area_id", table: "area" },
  device: { column: "branch_id", table: "branch" },
};

/** Tables that point at a parent row other than their organization. */
export const CHILD_TABLES = TENANT_TABLES.filter((table) => PARENT[table] !== undefined);

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
  const columns = ["id", "tenant_id", table === "app_user" ? "display_name" : "name"];
  const values: unknown[] = [table === "organization" ? tenantId : newId(), tenantId, "x"];
  const parent = PARENT[table];
  if (parent !== undefined) {
    columns.push(parent.column);
    values.push(parents.ids[parent.table]);
  }
  const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
  return { sql: `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`, values };
}
