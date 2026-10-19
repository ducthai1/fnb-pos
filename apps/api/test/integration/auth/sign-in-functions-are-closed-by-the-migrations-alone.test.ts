import { runMigrations } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { postgresErrorCode } from "../support/postgres-error-code";
import { type ScratchDatabase, createScratchDatabase } from "../support/scratch-database";
import { withClient } from "../support/with-client";

// The shared test database is provisioned with default privileges that already keep PUBLIC
// out, so it cannot show what the migrations do on their own. This one is built by the
// migrations alone, as a deployment that skipped or botched that step would be, and the
// app role stands in for any role that can connect but was granted nothing.
const info = inject("testPostgres");
const INSUFFICIENT_PRIVILEGE = "42501";

interface FunctionRow {
  signature: string;
  /** A call with typed NULL arguments; null for trigger functions, which cannot be called. */
  call: string | null;
  public: boolean;
  ungranted: boolean;
  definer: boolean;
  config: string[] | null;
}

// Every function of fnb_auth, and every owner-run function in any other schema.
const FUNCTIONS = `
  SELECT p.oid::regprocedure::text AS signature,
         CASE WHEN p.prorettype <> 'trigger'::regtype THEN format('SELECT %s(%s)', p.oid::regproc,
           (SELECT string_agg('NULL::' || format_type(a.type, NULL), ', ' ORDER BY a.position)
            FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY AS a (type, position))) END AS call,
         has_function_privilege('public', p.oid, 'EXECUTE') AS public,
         has_function_privilege($1, p.oid, 'EXECUTE') AS ungranted,
         p.prosecdef AS definer, p.proconfig AS config
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%'
    AND (n.nspname = 'fnb_auth' OR p.prosecdef)
  ORDER BY signature`;

let scratch: ScratchDatabase;
let functions: FunctionRow[];

beforeAll(async () => {
  scratch = await createScratchDatabase(info);
  await runMigrations(scratch.ownerUrl);
  const result = await withClient(scratch.ownerUrl, (client) =>
    client.query<FunctionRow>(FUNCTIONS, [info.app.user]),
  );
  functions = result.rows;
});

afterAll(async () => {
  await scratch.drop();
});

const asUngrantedRole = (sql: string) =>
  withClient(testConnectionString(info, "app", scratch.name), (client) => client.query(sql));

describe("sign-in functions on a database built by the migrations alone", () => {
  it("are not executable by PUBLIC", () => {
    expect(functions.filter((f) => f.signature.startsWith("fnb_auth.")).length).toBeGreaterThan(5);
    const open = functions.filter((f) => f.public || f.ungranted).map((f) => f.signature);
    expect(open).toEqual([]);
  });

  it("refuse every call from a role that was granted nothing, with insufficient privilege", async () => {
    const callable = functions.flatMap((f) => (f.call === null ? [] : [{ ...f, call: f.call }]));
    expect(callable.length).toBeGreaterThan(5);
    const answers = [];
    for (const f of callable) {
      answers.push({
        f: f.signature,
        code: await postgresErrorCode(() => asUngrantedRole(f.call)),
      });
    }
    expect(answers).toEqual(
      callable.map((f) => ({ f: f.signature, code: INSUFFICIENT_PRIVILEGE })),
    );
  });

  it("still run for their owner, so the refusals above are about privileges", async () => {
    const code = await postgresErrorCode(() =>
      withClient(scratch.ownerUrl, (client) =>
        client.query("SELECT * FROM fnb_auth.find_session($1, now())", ["0".repeat(64)]),
      ),
    );
    expect(code).toBe("no-error");
  });

  it("leave a function added by a later migration closed to PUBLIC as well", async () => {
    const open = await withClient(scratch.ownerUrl, async (client) => {
      await client.query(
        "CREATE FUNCTION fnb_auth.added_later() RETURNS int LANGUAGE sql AS 'SELECT 1'",
      );
      const result = await client.query<{ open: boolean }>(
        "SELECT has_function_privilege('public', 'fnb_auth.added_later()', 'EXECUTE') AS open",
      );
      await client.query("DROP FUNCTION fnb_auth.added_later()");
      return result.rows[0]?.open;
    });
    expect(open).toBe(false);
  });

  it("all run as their owner with a pinned search path", () => {
    const loose = functions
      .filter((f) => !f.definer || f.config?.join() !== "search_path=pg_catalog, pg_temp")
      .map((f) => ({ f: f.signature, definer: f.definer, config: f.config }));
    expect(loose).toEqual([]);
  });
});
