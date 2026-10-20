import { access } from "node:fs/promises";
import pg from "pg";
import type { RestoreSettings } from "./backup-environment";
import { libpqEnvironment, runPostgresTool } from "./postgres-client-tools";
import { renewGenerationOf } from "./renew-server-generation";

export interface RestoreRequest {
  readonly file: string;
  readonly database: string;
  /** Drops a database of that name first. Without it an existing database is refused. */
  readonly replaceExisting: boolean;
}

export type RestoreOutcome =
  | {
      readonly kind: "restored";
      readonly millis: number;
      /** The new server generation; null for a backup older than the generation table. */
      readonly generation: string | null;
    }
  | { readonly kind: "refused"; readonly reason: string };

const DATABASE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

/**
 * A backup into a database created for it, owned by the owner role, with the privileges
 * the dump carries (default privileges, grants to the app role, row level security). The
 * roles are cluster-wide and not in a dump, so they must exist first (`pnpm db:provision`
 * on a new server). An existing database is never written into: without replaceExisting
 * it is refused, with it it is dropped and made again. pg_restore runs in one transaction,
 * so a failed restore leaves no half-restored database behind: the new one is dropped.
 * A restored database gets a new server generation, so tills catch up with it.
 */
export async function restoreBackup(
  settings: RestoreSettings,
  pgRestore: string,
  request: RestoreRequest,
): Promise<RestoreOutcome> {
  const refuse = (reason: string): RestoreOutcome => ({ kind: "refused", reason });
  if (!DATABASE_NAME.test(request.database)) {
    return refuse(`${request.database} is not a lower-case database name`);
  }
  if (
    !(await access(request.file).then(
      () => true,
      () => false,
    ))
  ) {
    return refuse(`${request.file} does not exist or cannot be read`);
  }
  const admin = new pg.Client({ connectionString: settings.adminUrl });
  await admin.connect();
  try {
    const name = admin.escapeIdentifier(request.database);
    const facts = await admin.query<{ connected: string; exists: boolean; owner: boolean }>(
      "SELECT current_database() AS connected, " +
        "EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS exists, " +
        "EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $2) AS owner",
      [request.database, settings.ownerRole],
    );
    const { connected, exists, owner } = facts.rows[0] ?? {};
    if (!owner) return refuse(`role ${settings.ownerRole} does not exist: run db:provision first`);
    if (connected === request.database) return refuse("cannot restore into the admin database");
    if (exists && !request.replaceExisting) {
      return refuse(
        `database ${request.database} already exists; choose another --database, ` +
          "or pass --replace-existing to drop it first",
      );
    }
    if (exists) await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await admin.query(
      `CREATE DATABASE ${name} OWNER ${admin.escapeIdentifier(settings.ownerRole)}`,
    );
    await admin.query(`REVOKE TEMPORARY ON DATABASE ${name} FROM PUBLIC`);
    const started = Date.now();
    const run = await runPostgresTool(
      pgRestore,
      [
        "--exit-on-error",
        "--single-transaction",
        "--no-password",
        `--dbname=${request.database}`,
        request.file,
      ],
      libpqEnvironment(settings.adminUrl, request.database),
    );
    if (run.exitCode !== 0) {
      await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
      throw new Error(`pg_restore exited with ${run.exitCode}: ${run.stderr.trim()}`);
    }
    const millis = Date.now() - started;
    // The rows are as of the backup, the tills are not: a new generation tells each one to
    // send again what the backup does not hold and to pull the feed from the start.
    const { current } = await renewGenerationOf(settings.adminUrl, request.database);
    return { kind: "restored", millis, generation: current };
  } finally {
    await admin.end();
  }
}
