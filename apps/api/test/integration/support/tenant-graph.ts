import {
  appUser,
  appendAudit,
  area,
  branch,
  brand,
  configValue,
  device,
  diningTable,
  drizzleFor,
  newId,
  organization,
  recordApproval,
  withTenant,
} from "@fnb/db";
import type pg from "pg";

/** Every tenancy table; the catalog test fails if `public` gains a table missing here. */
export const TENANT_TABLES = [
  "app_user",
  "approval_log",
  "area",
  "audit_log",
  "branch",
  "brand",
  "config_value",
  "device",
  "dining_table",
  "organization",
] as const;

export type TenantTable = (typeof TENANT_TABLES)[number];

/** Evidence tables: the app role may read and add rows, never change or remove them. */
export const APPEND_ONLY_TABLES = ["approval_log", "audit_log"] as const satisfies TenantTable[];

export const MUTABLE_TENANT_TABLES = TENANT_TABLES.filter(
  (table) => !(APPEND_ONLY_TABLES as readonly string[]).includes(table),
);

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
    approval_log: newId(),
    audit_log: newId(),
    config_value: newId(),
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
    await db.insert(configValue).values({
      id: ids.config_value,
      tenantId,
      scopeKind: "device",
      scopeId: ids.device,
      key: "cup_labels",
      value: true,
    });
    await recordApproval(client, {
      id: ids.approval_log,
      actionKey: "refund",
      requestedByStaffId: newId(),
      approvedByStaffId: newId(),
      deviceId: ids.device,
      branchId: ids.branch,
    });
    await appendAudit(client, {
      id: ids.audit_log,
      actor: { kind: "app_user", id: ids.app_user },
      action: "branch.created",
      entityKind: "branch",
      entityId: ids.branch,
    });
  });
  return { tenantId, ids };
}

/** The columns besides id and tenant_id one row needs, with parents taken from `parents`. */
const ROW_COLUMNS: Record<TenantTable, (parents: TenantGraph) => Record<string, unknown>> = {
  organization: () => ({ name: "x" }),
  brand: () => ({ name: "x" }),
  branch: (p) => ({ name: "x", brand_id: p.ids.brand }),
  area: (p) => ({ name: "x", branch_id: p.ids.branch }),
  dining_table: (p) => ({ name: "x", area_id: p.ids.area }),
  device: (p) => ({ name: "x", branch_id: p.ids.branch }),
  app_user: () => ({ display_name: "x" }),
  approval_log: (p) => ({
    action_key: "refund",
    requested_by_staff_id: newId(),
    approved_by_staff_id: newId(),
    branch_id: p.ids.branch,
    device_id: p.ids.device,
  }),
  audit_log: () => ({ actor_kind: "system", action: "x", entity_kind: "x", entity_id: newId() }),
  config_value: (p) => ({
    scope_kind: "device",
    scope_id: p.ids.device,
    key: `k${newId()}`,
    value: "true",
  }),
};

/** Tables that point at a parent row other than their organization. */
export const CHILD_TABLES = [
  "approval_log",
  "area",
  "branch",
  "config_value",
  "device",
  "dining_table",
] as const satisfies TenantTable[];

/**
 * A parameterized INSERT of one row into `table` with the given tenant_id, whose parent
 * keys are taken from `parents`. An organization row is its own tenant, so its id is the
 * tenant id.
 */
export function insertRow(
  table: TenantTable,
  tenantId: string,
  parents: TenantGraph,
): { sql: string; values: unknown[] } {
  const row: Record<string, unknown> = {
    id: table === "organization" ? tenantId : newId(),
    tenant_id: tenantId,
    ...ROW_COLUMNS[table](parents),
  };
  const columns = Object.keys(row);
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
  return {
    sql: `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`,
    values: Object.values(row),
  };
}
