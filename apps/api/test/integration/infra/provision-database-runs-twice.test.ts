import { randomBytes } from "node:crypto";
import { databaseUrlFor, provisionDatabase } from "@fnb/db";
import { asSuperuser, testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { afterAll, describe, expect, inject, it } from "vitest";

const info = inject("testPostgres");
const suffix = randomBytes(5).toString("hex");
const target = {
  adminUrl: testConnectionString(info, "superuser", "postgres"),
  database: `fnb_provision_${suffix}`,
  owner: { user: `fnb_owner_${suffix}`, password: randomBytes(12).toString("hex") },
  app: { user: `fnb_app_${suffix}`, password: `${randomBytes(6).toString("hex")} @/:?#` },
};

const asApp = async <T>(work: (client: pg.Client) => Promise<T>): Promise<T> => {
  const url = databaseUrlFor(target.adminUrl, {
    database: target.database,
    credentials: target.app,
  });
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
};

afterAll(() =>
  asSuperuser(info, "postgres", async (client) => {
    await client.query(`DROP DATABASE IF EXISTS ${client.escapeIdentifier(target.database)}`);
    for (const role of [target.app.user, target.owner.user]) {
      await client.query(`DROP ROLE IF EXISTS ${client.escapeIdentifier(role)}`);
    }
  }),
);

describe("provisioning a database for a real environment", () => {
  it("creates the roles and the database, migrates, and changes nothing the second time", async () => {
    const first = await provisionDatabase(target);
    expect(first.createdRoles).toEqual([target.owner.user, target.app.user]);
    expect(first.createdDatabase).toBe(true);
    expect(first.migrations.applied.length).toBeGreaterThan(0);

    const second = await provisionDatabase(target);
    expect(second).toEqual({
      createdRoles: [],
      createdDatabase: false,
      migrations: { applied: [], alreadyApplied: first.migrations.applied },
    });
  });

  it("lets the app role read and write tables but never the migration ledger", async () => {
    await asApp(async (client) => {
      expect((await client.query("SELECT count(*) FROM organization")).rows).toEqual([
        { count: "0" },
      ]);
      await expect(
        client.query("SELECT count(*) FROM fnb_migration.applied_migration"),
      ).rejects.toThrow(/permission denied/);
    });
  });

  it("leaves no function of the owner executable by PUBLIC", async () => {
    const executableByPublic = await asApp((client) =>
      client.query(
        "SELECT n.nspname, p.proname FROM pg_proc p " +
          "JOIN pg_namespace n ON n.oid = p.pronamespace " +
          "CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a " +
          "WHERE p.proowner = (SELECT oid FROM pg_roles WHERE rolname = $1) " +
          "AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'",
        [target.owner.user],
      ),
    );
    expect(executableByPublic.rows).toEqual([]);
    const ownedByOwner = await asApp((client) =>
      client.query(
        "SELECT count(*)::int AS n FROM pg_proc WHERE proowner = " +
          "(SELECT oid FROM pg_roles WHERE rolname = $1)",
        [target.owner.user],
      ),
    );
    expect(ownedByOwner.rows[0].n).toBeGreaterThan(0);
  });

  it("puts a role someone made a superuser back to the safe attributes", async () => {
    await asSuperuser(info, "postgres", (client) =>
      client.query(`ALTER ROLE ${client.escapeIdentifier(target.app.user)} SUPERUSER BYPASSRLS`),
    );
    await provisionDatabase(target);
    const role = await asSuperuser(info, "postgres", (client) =>
      client.query("SELECT rolsuper, rolbypassrls, rolinherit FROM pg_roles WHERE rolname = $1", [
        target.app.user,
      ]),
    );
    expect(role.rows).toEqual([{ rolsuper: false, rolbypassrls: false, rolinherit: false }]);
  });
});
