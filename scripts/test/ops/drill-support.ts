import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

export interface CliRun {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * An ops command as `pnpm ops:*` runs it, from the repository root, with only the given
 * environment plus what finds the client tools (PATH, FNB_PG_BIN_DIR, LD_LIBRARY_PATH).
 */
export function runOpsCli(
  script: string,
  args: readonly string[],
  env: Record<string, string>,
): Promise<CliRun> {
  const passed = ["PATH", "FNB_PG_BIN_DIR", "LD_LIBRARY_PATH"].flatMap((name) => {
    const value = process.env[name];
    return value === undefined ? [] : [[name, value] as const];
  });
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", script, ...args], {
      cwd: REPO_ROOT,
      env: { ...Object.fromEntries(passed), ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.once("error", reject);
    child.once("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

/** Rows of every table of the schemas the app keeps data in, by `schema.table`. */
export async function rowCountsOfEveryTable(url: string): Promise<Record<string, number>> {
  return withConnection(url, async (client) => {
    const tables = await client.query<{ name: string }>(
      "SELECT format('%I.%I', schemaname, tablename) AS name FROM pg_tables " +
        "WHERE schemaname IN ('public', 'fnb_auth', 'fnb_migration') ORDER BY 1",
    );
    const counts: Record<string, number> = {};
    for (const { name } of tables.rows) {
      const result = await client.query<{ count: string }>(`SELECT count(*) FROM ${name}`);
      counts[name] = Number(result.rows[0]?.count);
    }
    return counts;
  });
}

/**
 * What keeps tenants apart and the app role in its place: row level security flags and
 * policies of every table, table and function privileges, and default privileges.
 */
export async function accessRules(url: string): Promise<Record<string, unknown>> {
  return withConnection(url, async (client) => {
    const query = async (sql: string) => (await client.query(sql)).rows;
    return {
      tables: await query(
        "SELECT n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity, " +
          "c.relacl::text AS acl, pg_get_userbyid(c.relowner) AS owner FROM pg_class c " +
          "JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r', 'S') " +
          "AND n.nspname IN ('public', 'fnb_auth', 'fnb_migration') ORDER BY 1, 2",
      ),
      policies: await query(
        "SELECT schemaname, tablename, policyname, qual, with_check FROM pg_policies ORDER BY 1, 2, 3",
      ),
      functions: await query(
        "SELECT p.oid::regprocedure::text AS name, p.prosecdef, p.proacl::text AS acl " +
          "FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace " +
          "WHERE n.nspname IN ('public', 'fnb_auth') ORDER BY 1",
      ),
      defaults: await query(
        "SELECT pg_get_userbyid(defaclrole) AS role, defaclobjtype, defaclacl::text AS acl " +
          "FROM pg_default_acl ORDER BY 1, 2, 3",
      ),
      triggers: await query(
        "SELECT tgrelid::regclass::text AS on_table, tgname FROM pg_trigger " +
          "WHERE NOT tgisinternal ORDER BY 1, 2",
      ),
    };
  });
}

async function withConnection<T>(url: string, work: (client: pg.Client) => Promise<T>) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}
