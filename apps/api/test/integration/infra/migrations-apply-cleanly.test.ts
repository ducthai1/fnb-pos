import { MIGRATIONS_DIRECTORY, listMigrationFiles, runMigrations } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { describePublicSchema } from "../support/describe-public-schema";
import { postgresErrorCode } from "../support/postgres-error-code";
import { type ScratchDatabase, createScratchDatabase } from "../support/scratch-database";
import { withClient } from "../support/with-client";

const info = inject("testPostgres");
const LEDGER = "SELECT name, checksum FROM fnb_migration.applied_migration ORDER BY name";

describe("shipped migrations on an empty database", () => {
  let scratch: ScratchDatabase;

  beforeAll(async () => {
    scratch = await createScratchDatabase(info);
  });

  afterAll(async () => {
    await scratch.drop();
  });

  it("apply every file and record each one once in the ledger", async () => {
    const files = await listMigrationFiles(MIGRATIONS_DIRECTORY);
    const report = await runMigrations(scratch.ownerUrl);
    expect(report).toEqual({ applied: files.map((f) => f.name), alreadyApplied: [] });
    const ledger = await withClient(scratch.ownerUrl, (client) => client.query(LEDGER));
    expect(ledger.rows).toEqual(files.map((f) => ({ name: f.name, checksum: f.checksum })));
  });

  it("apply nothing when run again and leave the schema and ledger unchanged", async () => {
    const files = await listMigrationFiles(MIGRATIONS_DIRECTORY);
    const before = await withClient(scratch.ownerUrl, async (client) => ({
      schema: await describePublicSchema(client),
      ledger: (await client.query(LEDGER)).rows,
    }));
    const report = await runMigrations(scratch.ownerUrl);
    expect(report).toEqual({ applied: [], alreadyApplied: files.map((f) => f.name) });
    const after = await withClient(scratch.ownerUrl, async (client) => ({
      schema: await describePublicSchema(client),
      ledger: (await client.query(LEDGER)).rows,
    }));
    expect(after).toEqual(before);
  });
});

describe("the shared integration database", () => {
  it("was migrated by the global setup with the files shipped today", async () => {
    const files = await listMigrationFiles(MIGRATIONS_DIRECTORY);
    const ledger = await withClient(testConnectionString(info, "owner"), (c) => c.query(LEDGER));
    expect(ledger.rows).toEqual(files.map((f) => ({ name: f.name, checksum: f.checksum })));
  });

  it("keeps the migration ledger out of reach of the app role", async () => {
    const appUrl = testConnectionString(info, "app");
    const read = await withClient(appUrl, (client) =>
      postgresErrorCode(() => client.query(LEDGER)),
    );
    const write = await withClient(appUrl, (client) =>
      postgresErrorCode(() =>
        client.query("DELETE FROM fnb_migration.applied_migration WHERE true"),
      ),
    );
    expect({ read, write }).toEqual({ read: "42501", write: "42501" });
  });

  it("lets the owner role read the ledger, so the denial above is about the role", async () => {
    const ownerUrl = testConnectionString(info, "owner");
    const code = await withClient(ownerUrl, (client) =>
      postgresErrorCode(() => client.query(LEDGER)),
    );
    expect(code).toBe("no-error");
  });
});
