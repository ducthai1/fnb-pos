import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type TestPostgresInfo,
  asSuperuser,
  createOwnedDatabase,
  testConnectionString,
} from "@fnb/db/test-support";

export interface ScratchDatabase {
  name: string;
  ownerUrl: string;
  drop(): Promise<void>;
}

/** An empty database owned by the owner role, for tests that must start from nothing. */
export async function createScratchDatabase(info: TestPostgresInfo): Promise<ScratchDatabase> {
  const name = `fnb_scratch_${randomBytes(6).toString("hex")}`;
  await asSuperuser(info, "postgres", (client) => createOwnedDatabase(client, info, name));
  return {
    name,
    ownerUrl: testConnectionString(info, "owner", name),
    drop: () =>
      asSuperuser(info, "postgres", async (client) => {
        await client.query(`DROP DATABASE ${client.escapeIdentifier(name)} WITH (FORCE)`);
      }),
  };
}

export interface MigrationDirectory {
  path: string;
  write(files: Record<string, string>): Promise<void>;
  remove(): Promise<void>;
}

/** A temp directory of hand-written migration files for exercising the runner itself. */
export async function createMigrationDirectory(): Promise<MigrationDirectory> {
  const path = await mkdtemp(join(tmpdir(), `fnb-migrations-${process.pid}-`));
  return {
    path,
    write: async (files) => {
      for (const [name, sql] of Object.entries(files)) await writeFile(join(path, name), sql);
    },
    remove: () => rm(path, { recursive: true, force: true }),
  };
}
