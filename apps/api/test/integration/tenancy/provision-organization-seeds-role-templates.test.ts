import { decodeRoleGrants, newId, provisionOrganization, withTenant } from "@fnb/db";
import { ROLE_TEMPLATES } from "@fnb/domain";
import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createAccount, uniqueEmail } from "../support/backoffice-accounts";
import { postgresErrorCode } from "../support/postgres-error-code";

const info = inject("testPostgres");
const FOREIGN_KEY_VIOLATION = "23503";
const NOT_NULL_VIOLATION = "23502";
const NOW = new Date("2026-10-20T08:00:00.000Z");

let pool: pg.Pool;

beforeAll(() => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
});

afterAll(async () => {
  await pool.end();
});

const provision = async (accountId?: string) =>
  provisionOrganization(pool, {
    name: "Cà phê Sáng",
    creator: {
      accountId: accountId ?? (await createAccount(pool, { email: uniqueEmail("owner") })),
      displayName: "Chị Hoa",
    },
    now: NOW,
  });

describe("provisioning an organization", () => {
  it("seeds the six role templates, each holding exactly the template's grants", async () => {
    const shop = await provision();
    const roles = await withTenant(pool, shop.tenantId, async (client) => {
      const result = await client.query(
        "SELECT id, permission_keys, thresholds, is_template, created_at FROM role ORDER BY id",
      );
      return result.rows;
    });
    expect(roles.map((row) => row.id).sort()).toEqual(Object.values(shop.roleIds).sort());
    for (const [key, template] of Object.entries(ROLE_TEMPLATES)) {
      const row = roles.find((candidate) => candidate.id === shop.roleIds[template.key]);
      expect({ key, template: row?.is_template, at: row?.created_at }).toEqual({
        key,
        template: true,
        at: NOW,
      });
      expect(decodeRoleGrants(row?.permission_keys, row?.thresholds)).toEqual(template.grants);
    }
  });

  it("makes the creator an active member holding the owner role", async () => {
    const accountId = await createAccount(pool, { email: uniqueEmail("owner") });
    const shop = await provision(accountId);
    const member = await withTenant(pool, shop.tenantId, async (client) => {
      const result = await client.query(
        "SELECT m.id, m.account_id, m.role_id, m.status, u.display_name FROM membership m " +
          "JOIN app_user u ON u.tenant_id = m.tenant_id AND u.id = m.app_user_id",
      );
      return result.rows;
    });
    expect(member).toEqual([
      {
        id: shop.membershipId,
        account_id: accountId,
        role_id: shop.roleIds.owner,
        status: "active",
        display_name: "Chị Hoa",
      },
    ]);
  });

  it("leaves nothing behind when any part fails, here an account that does not exist", async () => {
    const tenantId = newId();
    const failed = provisionOrganization(pool, {
      organizationId: tenantId,
      name: "Không thành",
      creator: { accountId: newId(), displayName: "Ai đó" },
      now: NOW,
    });
    await expect(failed).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    const left = await withTenant(pool, tenantId, async (client) => {
      const counts = await client.query(
        "SELECT (SELECT count(*) FROM organization)::int AS organizations, " +
          "(SELECT count(*) FROM role)::int AS roles, (SELECT count(*) FROM app_user)::int AS users",
      );
      return counts.rows[0];
    });
    expect(left).toEqual({ organizations: 0, roles: 0, users: 0 });
  });
});

describe("a membership's role", () => {
  const insertMembership = (tenantId: string, appUserId: string, roleId: string | null) =>
    withTenant(pool, tenantId, async (client) => {
      const account = await createAccount(pool, { email: uniqueEmail("member") });
      return postgresErrorCode(() =>
        client.query(
          "INSERT INTO membership (id, tenant_id, account_id, app_user_id, role_id) " +
            "VALUES ($1, $2, $3, $4, $5)",
          [newId(), tenantId, account, appUserId, roleId],
        ),
      );
    });

  it("can be a role of its own organization", async () => {
    const shop = await provision();
    expect(await insertMembership(shop.tenantId, shop.appUserId, shop.roleIds.manager)).toBe(
      "no-error",
    );
  });

  it("cannot be a role of another organization, even knowing its id", async () => {
    const [shop, other] = [await provision(), await provision()];
    expect(await insertMembership(shop.tenantId, shop.appUserId, other.roleIds.owner)).toBe(
      FOREIGN_KEY_VIOLATION,
    );
  });

  it("cannot be left out: a member without a role is not a state anyone checks for", async () => {
    const shop = await provision();
    expect(await insertMembership(shop.tenantId, shop.appUserId, null)).toBe(NOT_NULL_VIOLATION);
  });
});
