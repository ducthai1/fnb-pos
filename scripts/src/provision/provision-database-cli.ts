import { databaseUrlFor, provisionDatabase } from "@fnb/db";
import { readProvisionEnvironment } from "./provision-environment";

/**
 * `pnpm db:provision`: roles, database, default privileges and migrations for a real
 * environment, from FNB_ADMIN_DATABASE_URL, FNB_OWNER_PASSWORD and FNB_APP_PASSWORD (plus
 * the optional FNB_DATABASE_NAME, FNB_OWNER_ROLE, FNB_APP_ROLE). Safe to run on every
 * deploy: a second run changes nothing. Prints what it did, never a password.
 */
const configured = readProvisionEnvironment(process.env);
if (!configured.ok) {
  console.error("db:provision: the environment is not valid:");
  for (const problem of configured.problems) console.error(`  - ${problem}`);
  process.exit(1);
}
const { target } = configured;
try {
  const report = await provisionDatabase(target);
  const created = report.createdRoles.length === 0 ? "none" : report.createdRoles.join(", ");
  console.log(`db:provision: roles created: ${created}`);
  console.log(
    `db:provision: database ${target.database} ${report.createdDatabase ? "created" : "already there"}`,
  );
  console.log(
    `db:provision: migrations applied: ${report.migrations.applied.length}, ` +
      `already applied: ${report.migrations.alreadyApplied.length}`,
  );
  const appUrl = new URL(
    databaseUrlFor(target.adminUrl, {
      database: target.database,
      credentials: { user: target.app.user, password: "PASSWORD" },
    }),
  );
  console.log(`db:provision: the API connects with FNB_DATABASE_URL=${appUrl.toString()}`);
  console.log("db:provision: (PASSWORD stands for FNB_APP_PASSWORD)");
} catch (error) {
  console.error(`db:provision: failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
