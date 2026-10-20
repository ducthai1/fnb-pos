import { MIGRATIONS_DIRECTORY, databaseUrlFor, listMigrationFiles } from "@fnb/db";
import pg from "pg";
import { maskSecrets } from "../http/server-error-report";
import { type ServerConfig, readServerConfig } from "../server/server-config";
import { type CheckStatus, type PreflightFacts, preflightChecks } from "./preflight-checks";

/**
 * `pnpm ops:preflight`: checks a production deployment before a shop is opened on it,
 * with the API's environment file loaded (and FNB_ADMIN_DATABASE_URL for the migration
 * ledger, which the app role cannot read). Prints one line per check, never a value of a
 * secret; exits 1 when any check fails. FNB_PREFLIGHT_HEALTH_URL overrides where /health
 * is asked (by default the API's own HOST and PORT).
 */
const env = process.env;
const configured = readServerConfig(env);
const reason = (error: unknown) =>
  maskSecrets(error instanceof Error ? error.message : String(error));

async function withClient<T>(url: string, work: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5_000 });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

async function roleFacts(config: ServerConfig): Promise<PreflightFacts["role"]> {
  try {
    const { rows } = await withClient(config.databaseUrl, (client) =>
      client.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
        "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
      ),
    );
    const role = rows[0];
    if (role === undefined) return { error: "the role is not in pg_roles" };
    return { superuser: role.rolsuper, bypassesRls: role.rolbypassrls };
  } catch (error) {
    return { error: reason(error) };
  }
}

async function migrationFacts(config: ServerConfig): Promise<PreflightFacts["migrations"]> {
  const adminUrl = env.FNB_ADMIN_DATABASE_URL;
  if (adminUrl === undefined || adminUrl === "") return null;
  try {
    const database = decodeURIComponent(new URL(config.databaseUrl).pathname.slice(1));
    const applied = await withClient(databaseUrlFor(adminUrl, { database }), async (client) =>
      (
        await client.query<{ name: string }>("SELECT name FROM fnb_migration.applied_migration")
      ).rows.map((row) => row.name),
    );
    const shipped = (await listMigrationFiles(MIGRATIONS_DIRECTORY)).map((file) => file.name);
    return {
      pending: shipped.filter((name) => !applied.includes(name)),
      unknown: applied.filter((name) => !shipped.includes(name)),
    };
  } catch (error) {
    return { error: `cannot read the migration ledger: ${reason(error)}` };
  }
}

async function healthFacts(config: ServerConfig): Promise<PreflightFacts["health"]> {
  const host = config.host.includes(":") ? `[${config.host}]` : config.host;
  const url = env.FNB_PREFLIGHT_HEALTH_URL ?? `http://${host}:${config.port}/health`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    return { status: response.status };
  } catch (error) {
    return { error: reason(error) };
  }
}

const config = configured.ok ? configured.config : null;
const facts: PreflightFacts = {
  config: configured,
  role: config === null ? null : await roleFacts(config),
  migrations: config === null ? null : await migrationFacts(config),
  health: config === null ? null : await healthFacts(config),
};
const LABEL: Record<CheckStatus, string> = {
  pass: "ĐẠT      ",
  warn: "CẢNH BÁO ",
  fail: "KHÔNG ĐẠT",
};
const checks = preflightChecks(facts);
for (const check of checks) console.log(`${LABEL[check.status]} ${check.name}: ${check.detail}`);
const failedCount = checks.filter((check) => check.status === "fail").length;
console.log(failedCount === 0 ? "=> sẵn sàng mở cho quán" : `=> ${failedCount} mục không đạt`);
process.exit(failedCount === 0 ? 0 : 1);
