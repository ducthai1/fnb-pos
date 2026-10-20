import pg from "pg";
import { provisionDatabase } from "../provisioning/provision-database";
import { type TestPostgresInfo, testConnectionString } from "./test-postgres-info";

/**
 * Creates the owner and app roles and the shared test database, then migrates it as the
 * owner, the way a real environment is provisioned: the app role gets DML on every table
 * the owner creates in `public`, and EXECUTE on every function the owner creates, through
 * default privileges, so migrations never need to name roles.
 */
export async function provisionTestDatabase(info: TestPostgresInfo): Promise<void> {
  await provisionDatabase({
    adminUrl: testConnectionString(info, "superuser", "postgres"),
    database: info.database,
    owner: info.owner,
    app: info.app,
  });
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
