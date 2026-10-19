import { decodeRoleGrants } from "@fnb/db";
import type { Grant } from "@fnb/domain";
import type pg from "pg";

/**
 * The grants of one role of the current tenant, read inside withTenant. A stored role
 * that does not decode throws: it was written through the same check, so it means
 * corrupt data, and refusing loudly beats guessing what the role was meant to allow.
 */
export async function loadRoleGrants(client: pg.ClientBase, roleId: string): Promise<Grant[]> {
  const result = await client.query<{ permission_keys: string[]; thresholds: unknown }>(
    "SELECT permission_keys, thresholds FROM role WHERE id = $1",
    [roleId],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error(`role ${roleId} is not visible in this tenant`);
  return decodeRoleGrants(row.permission_keys, row.thresholds);
}
