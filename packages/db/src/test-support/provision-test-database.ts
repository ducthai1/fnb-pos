import pg from "pg";
import { runMigrations } from "../migrations/run-migrations";
import { type TestPostgresInfo, testConnectionString } from "./test-postgres-info";

/**
 * Creates the owner and app roles and the shared test database, then migrates it as the
 * owner. The app role gets DML on every table the owner creates in `public` through
 * default privileges, so migrations never need to name roles.
 */
export async function provisionTestDatabase(info: TestPostgresInfo): Promise<void> {
  await asSuperuser(info, "postgres", async (client) => {
    const owner = client.escapeIdentifier(info.owner.user);
    const app = client.escapeIdentifier(info.app.user);
    const attributes = "LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE";
    await client.query(
      `CREATE ROLE ${owner} ${attributes} PASSWORD ${client.escapeLiteral(info.owner.password)}`,
    );
    await client.query(
      `CREATE ROLE ${app} ${attributes} NOINHERIT PASSWORD ${client.escapeLiteral(info.app.password)}`,
    );
    await createOwnedDatabase(client, info, info.database);
  });
  await asSuperuser(info, info.database, async (client) => {
    const owner = client.escapeIdentifier(info.owner.user);
    const app = client.escapeIdentifier(info.app.user);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${app}`);
    await client.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA public ` +
        `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${app}`,
    );
  });
  await runMigrations(testConnectionString(info, "owner"));
}

/** An empty database owned by the owner role, for tests that migrate from scratch. */
export async function createOwnedDatabase(
  client: pg.Client,
  info: TestPostgresInfo,
  name: string,
): Promise<void> {
  const database = client.escapeIdentifier(name);
  await client.query(
    `CREATE DATABASE ${database} OWNER ${client.escapeIdentifier(info.owner.user)}`,
  );
  // PUBLIC may create temp tables by default; the app role should only touch its own rows.
  await client.query(`REVOKE TEMPORARY ON DATABASE ${database} FROM PUBLIC`);
}

export async function asSuperuser<T>(
  info: TestPostgresInfo,
  database: string,
  work: (client: pg.Client) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({
    connectionString: testConnectionString(info, "superuser", database),
  });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}
