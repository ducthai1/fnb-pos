import pg from "pg";
import { type MigrationReport, runMigrations } from "../migrations/run-migrations";
import { databaseUrlFor } from "./database-url";

export interface DatabaseRoleCredentials {
  readonly user: string;
  readonly password: string;
}

export interface DatabaseToProvision {
  /**
   * A role that may create roles and databases, connected to a maintenance database such as
   * `postgres`. It only bootstraps: the API never connects with it.
   */
  readonly adminUrl: string;
  readonly database: string;
  /** Owns the schema and runs migrations; not a superuser, so FORCE ROW LEVEL SECURITY binds it. */
  readonly owner: DatabaseRoleCredentials;
  /** What the API connects as: DML only, no BYPASSRLS, never the owner of anything. */
  readonly app: DatabaseRoleCredentials;
}

export interface ProvisionReport {
  readonly createdRoles: readonly string[];
  readonly createdDatabase: boolean;
  readonly migrations: MigrationReport;
}

// Neither role may outrank row level security or hand out roles and databases. The app
// role does not inherit, so a grant to it never leaks the owner's rights through membership.
const OWNER_ATTRIBUTES = "LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE";
const APP_ATTRIBUTES = `${OWNER_ATTRIBUTES} NOINHERIT`;

// Role and database creation is cluster-wide, so two runs at once would race on it.
const LOCK = "SELECT pg_advisory_lock(hashtext('fnb_provision'))";

/**
 * Creates the owner and app roles and the database when missing, sets the default
 * privileges that let migrations stay free of role names, then migrates as the owner.
 * Every step can run again: a second run changes nothing and applies no migration. A role
 * that already exists keeps its password but has its attributes put back to the safe ones,
 * so a role someone made a superuser by hand cannot quietly bypass row level security.
 */
export async function provisionDatabase(
  target: DatabaseToProvision,
  options: { migrationsDirectory?: string } = {},
): Promise<ProvisionReport> {
  const created = await asAdmin(target.adminUrl, async (client) => {
    await client.query(LOCK);
    const createdRoles: string[] = [];
    for (const [role, attributes] of [
      [target.owner, OWNER_ATTRIBUTES],
      [target.app, APP_ATTRIBUTES],
    ] as const) {
      if (await ensureRole(client, role, attributes)) createdRoles.push(role.user);
    }
    const createdDatabase = await ensureDatabase(client, target);
    return { createdRoles, createdDatabase };
  });
  await asAdmin(databaseUrlFor(target.adminUrl, { database: target.database }), (client) =>
    grantDefaultPrivileges(client, target),
  );
  const ownerUrl = databaseUrlFor(target.adminUrl, {
    database: target.database,
    credentials: target.owner,
  });
  const migrations = await runMigrations(
    ownerUrl,
    options.migrationsDirectory === undefined ? {} : { directory: options.migrationsDirectory },
  );
  return { ...created, migrations };
}

async function ensureRole(
  client: pg.Client,
  role: DatabaseRoleCredentials,
  attributes: string,
): Promise<boolean> {
  const name = client.escapeIdentifier(role.user);
  const existing = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role.user]);
  if (existing.rowCount === 0) {
    const password = client.escapeLiteral(role.password);
    await client.query(`CREATE ROLE ${name} ${attributes} PASSWORD ${password}`);
    return true;
  }
  await client.query(`ALTER ROLE ${name} ${attributes}`);
  return false;
}

async function ensureDatabase(client: pg.Client, target: DatabaseToProvision): Promise<boolean> {
  const database = client.escapeIdentifier(target.database);
  const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [
    target.database,
  ]);
  const missing = existing.rowCount === 0;
  if (missing) {
    const owner = client.escapeIdentifier(target.owner.user);
    await client.query(`CREATE DATABASE ${database} OWNER ${owner}`);
  }
  // PUBLIC may create temp tables by default; the app role should only touch its own rows.
  await client.query(`REVOKE TEMPORARY ON DATABASE ${database} FROM PUBLIC`);
  return missing;
}

async function grantDefaultPrivileges(client: pg.Client, target: DatabaseToProvision) {
  const owner = client.escapeIdentifier(target.owner.user);
  const app = client.escapeIdentifier(target.app.user);
  const forOwner = `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner}`;
  await client.query(`GRANT USAGE ON SCHEMA public TO ${app}`);
  await client.query(
    `${forOwner} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${app}`,
  );
  await client.query(`${forOwner} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${app}`);
  // Functions are executable by PUBLIC unless revoked, and only a database-wide default can
  // take that away. The owner's SECURITY DEFINER functions guard sign-in data, so only the
  // app role may call them.
  await client.query(`${forOwner} REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`);
  await client.query(`${forOwner} GRANT EXECUTE ON FUNCTIONS TO ${app}`);
}

async function asAdmin<T>(url: string, work: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}
