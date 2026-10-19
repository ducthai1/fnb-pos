import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { postgresErrorCode } from "../support/postgres-error-code";
import { withClient } from "../support/with-client";

// Accounts and sessions are global, so row level security cannot guard them. What guards
// them instead: the app role holds no privilege on the tables at all, and reaches them
// only through owner functions that answer for one exact identifier or token.
const info = inject("testPostgres");
const INSUFFICIENT_PRIVILEGE = "42501";
const GLOBAL_TABLES = ["fnb_auth.account", "fnb_auth.account_tenant", "fnb_auth.session"];

let app: pg.Pool;

beforeAll(() => {
  app = new pg.Pool({ connectionString: testConnectionString(info, "app") });
});

afterAll(async () => {
  await app.end();
});

describe.each(GLOBAL_TABLES)("the app role on %s", (table) => {
  it.each([
    ["read it", `SELECT * FROM ${table} LIMIT 1`],
    ["count it", `SELECT count(*) FROM ${table}`],
    ["add a row to it", `INSERT INTO ${table} DEFAULT VALUES`],
    ["empty it", `DELETE FROM ${table} WHERE true`],
  ])("cannot %s", async (_action, sql) => {
    expect(await postgresErrorCode(() => app.query(sql))).toBe(INSUFFICIENT_PRIVILEGE);
  });
});

describe("the sign-in functions", () => {
  it("can be called by the app role, so the denials above are about the tables", async () => {
    const code = await postgresErrorCode(() =>
      app.query("SELECT * FROM fnb_auth.find_session($1, now())", ["0".repeat(64)]),
    );
    expect(code).toBe("no-error");
  });

  it("are owner-run with a pinned search path, and not executable by PUBLIC", async () => {
    const result = await withClient(testConnectionString(info, "owner"), (client) =>
      client.query(`
        SELECT p.proname AS name, p.prosecdef AS definer,
               p.proconfig AS config, has_function_privilege('public', p.oid, 'EXECUTE') AS public
        FROM pg_proc p WHERE p.pronamespace = 'fnb_auth'::regnamespace ORDER BY p.proname`),
    );
    expect(result.rows.length).toBeGreaterThan(0);
    for (const row of result.rows) {
      expect(row).toEqual({
        name: row.name,
        definer: true,
        config: ["search_path=pg_catalog, pg_temp"],
        public: false,
      });
    }
  });

  it("hand out a password hash only to a caller who names the exact account", async () => {
    const result = await app.query(
      "SELECT * FROM fnb_auth.claim_login_attempt('%', NULL, now(), 5, interval '15 minutes')",
    );
    expect(result.rowCount).toBe(0);
  });
});
