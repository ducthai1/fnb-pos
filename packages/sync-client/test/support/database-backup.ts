import type { ProvisionedScratchDatabase } from "@fnb/api/test-support/provisioned-scratch-database";
import { renewServerGeneration } from "@fnb/db";
import { type TestPostgresInfo, asSuperuser } from "@fnb/db/test-support";
import type { ScenarioServer } from "./scenario-server";

/**
 * A backup and a restore of a scenario's own database, done the way the server's would be
 * minus pg_dump (the embedded Postgres ships without it): the API is stopped, the whole
 * database is copied (CREATE DATABASE … TEMPLATE: every row, sequence, grant and policy,
 * change_seq included), and a restore puts the copy back in place of the live database and
 * draws a new server generation with the function ops:restore runs.
 */
export class DatabaseBackup {
  private constructor(
    private readonly info: TestPostgresInfo,
    private readonly live: ProvisionedScratchDatabase,
    private readonly copy: string,
  ) {}

  /** Takes the backup now: the server is stopped for the copy and started again. */
  static async take(
    info: TestPostgresInfo,
    live: ProvisionedScratchDatabase,
    server: ScenarioServer,
  ): Promise<DatabaseBackup> {
    const backup = new DatabaseBackup(info, live, `${live.database}_backup`);
    await server.close();
    await backup.copyDatabase(live.database, backup.copy);
    server.start();
    return backup;
  }

  /** Replaces the live database with the backup, renews its generation, restarts the API. */
  async restoreInto(server: ScenarioServer): Promise<void> {
    await server.close();
    await asSuperuser(this.info, "postgres", (client) =>
      client.query(`DROP DATABASE ${client.escapeIdentifier(this.live.database)} WITH (FORCE)`),
    );
    await this.copyDatabase(this.copy, this.live.database);
    await asSuperuser(this.info, this.live.database, renewServerGeneration);
    server.start();
  }

  async drop(): Promise<void> {
    await asSuperuser(this.info, "postgres", (client) =>
      client.query(`DROP DATABASE IF EXISTS ${client.escapeIdentifier(this.copy)} WITH (FORCE)`),
    );
  }

  private copyDatabase(from: string, to: string) {
    return asSuperuser(this.info, "postgres", (client) =>
      client.query(
        `CREATE DATABASE ${client.escapeIdentifier(to)} TEMPLATE ` +
          `${client.escapeIdentifier(from)} OWNER ${client.escapeIdentifier(this.live.owner)}`,
      ),
    );
  }
}
