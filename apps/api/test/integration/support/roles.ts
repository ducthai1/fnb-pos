import { encodeRoleGrants, newId, withTenant } from "@fnb/db";
import { type Grant, ROLE_TEMPLATES } from "@fnb/domain";
import type pg from "pg";

/** A role of the tenant holding exactly `grants`, stored the way the API stores roles. */
export async function createRole(
  pool: pg.Pool,
  tenantId: string,
  grants: readonly Grant[],
  name = "Vai trò thử",
): Promise<string> {
  const id = newId();
  const stored = encodeRoleGrants(grants);
  await withTenant(pool, tenantId, (client) =>
    client.query(
      "INSERT INTO role (id, tenant_id, name, permission_keys, thresholds) VALUES ($1, $2, $3, $4, $5)",
      [id, tenantId, name, stored.permissionKeys, stored.thresholds],
    ),
  );
  return id;
}

/** Every key, no limit: what a shop's owner holds. */
export const OWNER_GRANTS = ROLE_TEMPLATES.owner.grants;
