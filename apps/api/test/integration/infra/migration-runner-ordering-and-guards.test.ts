import { DB_ERROR_CODES, isDatabaseError, runMigrations } from "@fnb/db";
import { afterEach, beforeEach, describe, expect, inject, it } from "vitest";
import {
  type MigrationDirectory,
  type ScratchDatabase,
  createMigrationDirectory,
  createScratchDatabase,
} from "../support/scratch-database";
import { withClient } from "../support/with-client";

const info = inject("testPostgres");
const CREATE_THING = "CREATE TABLE thing (id uuid PRIMARY KEY);";
const ADD_NOTE = "ALTER TABLE thing ADD COLUMN note text;";

let scratch: ScratchDatabase;
let directory: MigrationDirectory;

beforeEach(async () => {
  scratch = await createScratchDatabase(info);
  directory = await createMigrationDirectory();
});

afterEach(async () => {
  await scratch.drop();
  await directory.remove();
});

async function errorCodeOf(work: () => Promise<unknown>): Promise<string> {
  try {
    await work();
  } catch (error) {
    return isDatabaseError(error) ? error.code : "not-a-database-error";
  }
  return "no-error";
}

const migrate = () => runMigrations(scratch.ownerUrl, { directory: directory.path });

async function ledgerNames(): Promise<string[]> {
  const result = await withClient(scratch.ownerUrl, (client) =>
    client.query<{ name: string }>(
      "SELECT name FROM fnb_migration.applied_migration ORDER BY name",
    ),
  );
  return result.rows.map((row) => row.name);
}

async function tableExists(name: string): Promise<boolean> {
  const result = await withClient(scratch.ownerUrl, (client) =>
    client.query("SELECT to_regclass($1) IS NOT NULL AS present", [`public.${name}`]),
  );
  return result.rows[0].present as boolean;
}

describe("migration runner", () => {
  it("applies files in number order and only the ones added since the last run", async () => {
    await directory.write({ "0002_thing_note.sql": ADD_NOTE, "0001_thing.sql": CREATE_THING });
    expect((await migrate()).applied).toEqual(["0001_thing.sql", "0002_thing_note.sql"]);
    await directory.write({ "0003_other.sql": "CREATE TABLE other (id uuid PRIMARY KEY);" });
    expect(await migrate()).toEqual({
      applied: ["0003_other.sql"],
      alreadyApplied: ["0001_thing.sql", "0002_thing_note.sql"],
    });
  });

  it("refuses to run when a file was edited after it was applied", async () => {
    await directory.write({ "0001_thing.sql": CREATE_THING });
    await migrate();
    await directory.write({
      "0001_thing.sql": `${CREATE_THING} -- edited`,
      "0002_thing_note.sql": ADD_NOTE,
    });
    expect(await errorCodeOf(migrate)).toBe(DB_ERROR_CODES.migrationChecksumMismatch);
    expect(await ledgerNames()).toEqual(["0001_thing.sql"]);
  });

  it("rolls back a failing file completely and records nothing for it", async () => {
    await directory.write({
      "0001_thing.sql": CREATE_THING,
      "0002_broken.sql": "CREATE TABLE half_done (id uuid); SELECT 1 / 0;",
    });
    expect(await errorCodeOf(migrate)).toBe(DB_ERROR_CODES.migrationFailed);
    expect(await ledgerNames()).toEqual(["0001_thing.sql"]);
    expect({ thing: await tableExists("thing"), halfDone: await tableExists("half_done") }).toEqual(
      {
        thing: true,
        halfDone: false,
      },
    );
  });

  it("applies each file exactly once when several runners start together", async () => {
    await directory.write({ "0001_thing.sql": CREATE_THING, "0002_thing_note.sql": ADD_NOTE });
    const reports = await Promise.all([migrate(), migrate(), migrate()]);
    expect(reports.flatMap((report) => report.applied).sort()).toEqual([
      "0001_thing.sql",
      "0002_thing_note.sql",
    ]);
    expect(await ledgerNames()).toEqual(["0001_thing.sql", "0002_thing_note.sql"]);
  });

  it.each(["1_thing.sql", "0001-thing.sql", "0001_Thing.sql", "0001_.sql"])(
    "rejects the badly named file %s before touching the database",
    async (name) => {
      await directory.write({ [name]: CREATE_THING });
      expect(await errorCodeOf(migrate)).toBe(DB_ERROR_CODES.migrationInvalidFileName);
      expect(await tableExists("thing")).toBe(false);
    },
  );

  it("rejects two files that share a number, since their order would be a guess", async () => {
    await directory.write({ "0001_thing.sql": CREATE_THING, "0001_other.sql": CREATE_THING });
    expect(await errorCodeOf(migrate)).toBe(DB_ERROR_CODES.migrationDuplicateNumber);
    expect(await tableExists("thing")).toBe(false);
  });
});
