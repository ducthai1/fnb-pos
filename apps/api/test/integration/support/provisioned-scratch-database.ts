import { randomBytes } from "node:crypto";
import { databaseUrlFor, provisionDatabase } from "@fnb/db";
import { type TestPostgresInfo, asSuperuser, testConnectionString } from "@fnb/db/test-support";

export interface ProvisionedScratchDatabase {
  readonly database: string;
  /** The role owning the database and its tables. */
  readonly owner: string;
  /** The app role's connection string. */
  readonly appUrl: string;
  /** The bootstrap superuser on this database, for reading what the app role cannot. */
  readonly superuserUrl: string;
  /** The database and its two roles are dropped. */
  drop(): Promise<void>;
}

/**
 * A database of its own, provisioned as a real environment is (own owner and app roles,
 * default privileges, migrations), for tests that act on every tenant at once and must
 * not meet the rows other test files are working on in the shared database.
 */
export async function provisionScratchDatabase(
  info: TestPostgresInfo,
): Promise<ProvisionedScratchDatabase> {
  const suffix = randomBytes(5).toString("hex");
  const target = {
    adminUrl: testConnectionString(info, "superuser", "postgres"),
    database: `fnb_sweep_${suffix}`,
    owner: { user: `fnb_owner_${suffix}`, password: randomBytes(12).toString("hex") },
    app: { user: `fnb_app_${suffix}`, password: randomBytes(12).toString("hex") },
  };
  await provisionDatabase(target);
  return {
    database: target.database,
    owner: target.owner.user,
    appUrl: databaseUrlFor(target.adminUrl, { database: target.database, credentials: target.app }),
    superuserUrl: databaseUrlFor(target.adminUrl, { database: target.database }),
    drop: () =>
      asSuperuser(info, "postgres", async (client) => {
        const database = client.escapeIdentifier(target.database);
        await client.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
        for (const role of [target.app.user, target.owner.user]) {
          await client.query(`DROP ROLE IF EXISTS ${client.escapeIdentifier(role)}`);
        }
      }),
  };
}
