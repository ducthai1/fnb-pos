import { withTenant } from "@fnb/db";
import { PERMISSION_KEYS } from "@fnb/domain";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import {
  addMember,
  createAccount,
  signedInMember,
  uniqueEmail,
} from "../support/backoffice-accounts";
import { listRoles, patchRole } from "../support/role-requests";
import { createRole } from "../support/roles";
import { staffedShop } from "../support/staffed-shop";

// manage_staff is what edits roles, so an organization where no active member holds it
// can never be administered again. The owner template is only where it starts.
const info = inject("testPostgres");
const LAST = { status: 409, body: { code: "API_ROLE_LAST_ADMINISTRATOR" } };
const WITHOUT_ADMINISTRATION = {
  permissionKeys: PERMISSION_KEYS.filter((key) => key !== "manage_staff"),
  thresholds: {},
};

let pool: pg.Pool;
let owner: pg.Pool;
let app: FastifyInstance;

beforeAll(() => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  owner = new pg.Pool({ connectionString: testConnectionString(info, "owner") });
  app = buildApp({ pool });
});

afterAll(async () => {
  await app.close();
  await Promise.all([pool.end(), owner.end()]);
});

/** Until two edits wait on a lock: one at its audit insert, the other there or at the organization lock. */
async function bothEditsWaiting(): Promise<void> {
  for (let poll = 0; poll < 10_000; poll++) {
    const result = await pool.query(
      "SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' " +
        "AND (query LIKE 'INSERT INTO audit_log%' OR query LIKE 'SELECT 1 FROM organization FOR UPDATE%')",
    );
    if (result.rows[0].n >= 2) return;
  }
  throw new Error("the two edits never both reached a lock");
}

const administratorRole = (tenantId: string) =>
  createRole(pool, tenantId, [{ key: "manage_staff" }], "Quản trị");

const holdsManageStaff = async (cookie: string, roleId: string) =>
  (await listRoles(app, cookie)).body.roles
    .find((role: { id: string }) => role.id === roleId)
    .permissionKeys.includes("manage_staff");

const activeAdministrators = (tenantId: string) =>
  withTenant(pool, tenantId, async (client) => {
    const result = await client.query(
      "SELECT count(*)::int AS n FROM membership m JOIN role r ON r.tenant_id = m.tenant_id " +
        "AND r.id = m.role_id WHERE m.status = 'active' AND 'manage_staff' = ANY (r.permission_keys)",
    );
    return result.rows[0].n as number;
  });

describe("taking manage_staff away from a role", () => {
  it("is refused while that role's members are the only ones holding it", async () => {
    const shop = await staffedShop(app, pool);
    const owner = shop.roleIds.owner;
    expect(await patchRole(app, shop.managerCookie, owner, WITHOUT_ADMINISTRATION)).toEqual(LAST);
    expect(await holdsManageStaff(shop.managerCookie, owner)).toBe(true);
  });

  it("is allowed once an active member holds it through another role", async () => {
    const shop = await staffedShop(app, pool);
    const roleId = await administratorRole(shop.tenantId);
    await signedInMember(app, pool, shop.tenantId, { roleId });
    const answer = await patchRole(
      app,
      shop.managerCookie,
      shop.roleIds.owner,
      WITHOUT_ADMINISTRATION,
    );
    expect(answer.status).toBe(200);
    expect(await activeAdministrators(shop.tenantId)).toBe(1);
  });

  it("does not count a suspended member as that other administrator", async () => {
    const shop = await staffedShop(app, pool);
    const roleId = await administratorRole(shop.tenantId);
    const accountId = await createAccount(pool, { email: uniqueEmail("suspended") });
    await addMember(pool, shop.tenantId, accountId, { roleId, status: "suspended" });
    expect(
      await patchRole(app, shop.managerCookie, shop.roleIds.owner, WITHOUT_ADMINISTRATION),
    ).toEqual(LAST);
  });

  it("is allowed from a role nobody holds", async () => {
    const shop = await staffedShop(app, pool);
    const roleId = await administratorRole(shop.tenantId);
    const answer = await patchRole(app, shop.managerCookie, roleId, {
      permissionKeys: ["refund"],
      thresholds: {},
    });
    expect(answer.status).toBe(200);
  });

  it("is not what renaming does: the last administrators' role can still be renamed", async () => {
    const shop = await staffedShop(app, pool);
    const answer = await patchRole(app, shop.managerCookie, shop.roleIds.owner, { name: "Bà chủ" });
    expect(answer).toMatchObject({ status: 200, body: { name: "Bà chủ" } });
  });

  it("cannot happen twice at once, each edit stripping a different last administrator", async () => {
    const shop = await staffedShop(app, pool);
    const roleId = await administratorRole(shop.tenantId);
    const second = await signedInMember(app, pool, shop.tenantId, { roleId });
    // Both edits write their audit entry after their check. Holding audit inserts back
    // makes both checks run before either edit can commit, which is the race itself.
    const blocker = await owner.connect();
    let answers;
    try {
      await blocker.query("BEGIN");
      await blocker.query("LOCK TABLE audit_log IN SHARE MODE");
      const pending = Promise.all([
        patchRole(app, second.cookie, shop.roleIds.owner, WITHOUT_ADMINISTRATION),
        patchRole(app, shop.managerCookie, roleId, { permissionKeys: [], thresholds: {} }),
      ]);
      await bothEditsWaiting();
      await blocker.query("COMMIT");
      answers = await pending;
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
    }
    expect(answers.filter((answer) => answer.status === 200)).toHaveLength(1);
    expect(await activeAdministrators(shop.tenantId)).toBe(1);
  });
});
