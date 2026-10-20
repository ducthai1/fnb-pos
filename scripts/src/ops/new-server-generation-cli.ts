import { parseArgs } from "node:util";
import { readRestoreSettings } from "./backup-environment";
import { renewGenerationOf } from "./renew-server-generation";

/**
 * `pnpm ops:new-server-generation --database <name>`: draws a new server generation by
 * hand, for a database brought back some other way than ops:restore (a disk snapshot, a
 * replica promoted after losing writes). Every till then sends again what that database
 * does not hold. Harmless on a database that lost nothing: tills find nothing to resend.
 */
const usage = "usage: pnpm ops:new-server-generation --database <name>";
let database: string | undefined;
try {
  database = parseArgs({ options: { database: { type: "string" } } }).values.database;
} catch (error) {
  console.error(`ops:new-server-generation: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
if (database === undefined) {
  console.error(`ops:new-server-generation: name the database\n${usage}`);
  process.exit(1);
}
const configured = readRestoreSettings(process.env);
if (!configured.ok) {
  console.error("ops:new-server-generation: the environment is not valid:");
  for (const problem of configured.problems) console.error(`  - ${problem}`);
  process.exit(1);
}
try {
  const renewed = await renewGenerationOf(configured.value.adminUrl, database);
  if (renewed.current === null) {
    console.error(`ops:new-server-generation: ${database} has no generation table: migrate it`);
    process.exit(1);
  }
  console.log(
    `ops:new-server-generation: ${database}: ${renewed.previous ?? "none"} -> ${renewed.current}`,
  );
} catch (error) {
  console.error(
    `ops:new-server-generation: failed: ${error instanceof Error ? error.message : error}`,
  );
  process.exit(1);
}
