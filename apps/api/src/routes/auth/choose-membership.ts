import { withTenant } from "@fnb/db";
import type pg from "pg";
import { accountTenants } from "../../auth/account-store";

export type MembershipChoice =
  | { kind: "chosen"; tenantId: string; appUserId: string }
  | { kind: "none" }
  | { kind: "not-a-member" }
  | { kind: "ambiguous"; organizations: { id: string; name: string }[] };

/**
 * The organization a new session works in: the one asked for, or the only active one.
 * An account in several organizations must say which; the caller gets the list to pick
 * from (the password was already right, so naming the organizations leaks nothing).
 */
export async function chooseMembership(
  pool: pg.Pool,
  accountId: string,
  organizationId: string | undefined,
): Promise<MembershipChoice> {
  const tenants = await accountTenants(pool, accountId);
  const candidates =
    organizationId === undefined ? tenants : tenants.filter((id) => id === organizationId);
  const active: { tenantId: string; appUserId: string; name: string }[] = [];
  for (const tenantId of candidates) {
    const result = await withTenant(pool, tenantId, (client) =>
      client.query<{ app_user_id: string; name: string }>(
        "SELECT m.app_user_id, o.name FROM membership m JOIN organization o ON o.id = m.tenant_id " +
          "WHERE m.account_id = $1 AND m.status = 'active'",
        [accountId],
      ),
    );
    const row = result.rows[0];
    if (row !== undefined) active.push({ tenantId, appUserId: row.app_user_id, name: row.name });
  }
  const [only, ...others] = active;
  if (only === undefined)
    return organizationId === undefined ? { kind: "none" } : { kind: "not-a-member" };
  if (others.length > 0) {
    return {
      kind: "ambiguous",
      organizations: active.map(({ tenantId, name }) => ({ id: tenantId, name })),
    };
  }
  return { kind: "chosen", tenantId: only.tenantId, appUserId: only.appUserId };
}
