import {
  appUser,
  appendAudit,
  area,
  branch,
  brand,
  configValue,
  device,
  deviceCredential,
  devicePairingCode,
  diningTable,
  drizzleFor,
  membership,
  newId,
  organization,
  recordApproval,
  role,
  staff,
  staffBranch,
  staffSession,
  withTenant,
} from "@fnb/db";
import type pg from "pg";
import { seedCatalogRows } from "./tenant-graph-catalog-seed";
import { randomSha256Hex } from "./tenant-graph-rows";

export { CHILD_TABLES, insertRow } from "./tenant-graph-rows";

/** Every tenancy table; the catalog test fails if `public` gains a table missing here. */
export const TENANT_TABLES = [
  "app_user",
  "approval_log",
  "area",
  "audit_log",
  "branch",
  "brand",
  "category",
  "combo_slot",
  "combo_slot_option",
  "config_value",
  "device",
  "device_credential",
  "device_pairing_code",
  "dining_table",
  "membership",
  "modifier_group",
  "modifier_group_variant_rule",
  "modifier_option",
  "organization",
  "price_list",
  "price_list_item",
  "product",
  "product_availability",
  "product_modifier_group",
  "product_variant",
  "role",
  "staff",
  "staff_branch",
  "staff_session",
  "station",
] as const;

export type TenantTable = (typeof TENANT_TABLES)[number];

/** Evidence tables: the app role may read and add rows, never change or remove them. */
export const APPEND_ONLY_TABLES = ["approval_log", "audit_log"] as const satisfies TenantTable[];

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

export interface TenantGraph {
  tenantId: string;
  ids: Record<TenantTable, string>;
}

/** One row in every tenancy table for a fresh tenant, written as the app role through RLS. */
export async function seedTenantGraph(pool: pg.Pool): Promise<TenantGraph> {
  const tenantId = newId();
  // The organization is its own tenant; every other table gets a fresh row id.
  const ids = Object.fromEntries(
    TENANT_TABLES.map((table) => [table, table === "organization" ? tenantId : newId()]),
  ) as Record<TenantTable, string>;

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
    const account = await client.query<{ id: string }>(
      "SELECT fnb_auth.create_account($1, $2, NULL, 'x', now()) AS id",
      [newId(), `seed-${tenantId}@example.test`],
    );
    await db.insert(membership).values({
      id: ids.membership,
      tenantId,
      accountId: account.rows[0]?.id ?? "",
      appUserId: ids.app_user,
    });
    await db.insert(deviceCredential).values({
      id: ids.device_credential,
      tenantId,
      deviceId: ids.device,
      tokenHash: randomSha256Hex(),
    });
    await db.insert(devicePairingCode).values({
      id: ids.device_pairing_code,
      tenantId,
      branchId: ids.branch,
      codeHash: randomSha256Hex(),
      createdByAppUserId: ids.app_user,
      expiresAt: new Date(),
    });
    await db.insert(role).values({ id: ids.role, tenantId, name: "Thu ngân" });
    await db.insert(staff).values({
      id: ids.staff,
      tenantId,
      displayName: "Lan",
      roleId: ids.role,
      pinHash: "x",
    });
    await db
      .insert(staffBranch)
      .values({ id: ids.staff_branch, tenantId, staffId: ids.staff, branchId: ids.branch });
    await db.insert(staffSession).values({
      id: ids.staff_session,
      tenantId,
      staffId: ids.staff,
      deviceId: ids.device,
      tokenHash: randomSha256Hex(),
      expiresAt: new Date(),
    });
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
    await seedCatalogRows(client, tenantId, ids);
  });
  return { tenantId, ids };
}
