import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { postgresErrorCode } from "../support/postgres-error-code";

const info = inject("testPostgres");
const INSUFFICIENT_PRIVILEGE = "42501";

let app: pg.Pool;

beforeAll(() => {
  app = new pg.Pool({ connectionString: testConnectionString(info, "app") });
});

afterAll(async () => {
  await app.end();
});

describe("the app role", () => {
  it("is neither a superuser nor allowed to bypass row level security", async () => {
    const result = await app.query(
      "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
    );
    expect(result.rows).toEqual([{ rolsuper: false, rolbypassrls: false }]);
  });

  it("can read a tenant table, so the refusals below are about the statement", async () => {
    expect(await postgresErrorCode(() => app.query("SELECT id FROM brand LIMIT 1"))).toBe(
      "no-error",
    );
  });

  // TRUNCATE ignores row level security entirely, so it must not be granted at all.
  it.each([
    ["truncate a table", "TRUNCATE brand CASCADE"],
    ["switch row level security off", "ALTER TABLE brand DISABLE ROW LEVEL SECURITY"],
    ["drop a tenant policy", "DROP POLICY brand_tenant_isolation ON brand"],
    ["create a table", "CREATE TABLE side_channel (id uuid)"],
    ["create a temporary table", "CREATE TEMPORARY TABLE side_channel (id uuid)"],
    ["become the owner role", `SET ROLE ${info.owner.user}`],
  ])("cannot %s", async (_action, sql) => {
    expect(await postgresErrorCode(() => app.query(sql))).toBe(INSUFFICIENT_PRIVILEGE);
  });

  it("cannot read around the policy by turning row_security off for its session", async () => {
    const client = await app.connect();
    try {
      await client.query("SET row_security = off");
      expect(await postgresErrorCode(() => client.query("SELECT id FROM brand"))).toBe(
        INSUFFICIENT_PRIVILEGE,
      );
    } finally {
      client.release(true);
    }
  });
});
