import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { runMigrations } from "@fnb/db";
import type pg from "pg";
import { afterEach, beforeEach, describe, expect, inject, it } from "vitest";
import {
  type MigrationDirectory,
  type ScratchDatabase,
  createMigrationDirectory,
  createScratchDatabase,
} from "../support/scratch-database";
import { withClient } from "../support/with-client";

const info = inject("testPostgres");
const MIGRATIONS = path.resolve(import.meta.dirname, "../../../../../packages/db/migrations");
const BEFORE = ["0199f000-0000-7000-8000-00000000e001", "0199f000-0000-7000-8000-00000000e002"];
const AFTER = "0199f000-0000-7000-8000-00000000e003";

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

async function copyMigrations(upTo: string) {
  const names = (await readdir(MIGRATIONS)).filter((name) => name.endsWith(".sql")).sort();
  const files: Record<string, string> = {};
  for (const name of names.filter((n) => n.slice(0, 4) <= upTo)) {
    files[name] = await readFile(path.join(MIGRATIONS, name), "utf8");
  }
  await directory.write(files);
}

/** An organization as sign-up makes one, in its own tenant, with no member left in it. */
const organization = (id: string) =>
  withClient(scratch.ownerUrl, async (client: pg.Client) => {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [id]);
    await client.query("INSERT INTO organization (id, tenant_id, name) VALUES ($1, $1, 'Quán')", [id]);
    await client.query("COMMIT");
  });

const swept = () =>
  withClient(scratch.ownerUrl, async (client: pg.Client) =>
    (await client.query<{ id: string }>("SELECT fnb_auth.tenants_to_sweep() AS id")).rows.map((row) => row.id),
  );

describe("the migration that sweeps every organization", () => {
  it("lists the organizations already there and every one made after, and puts row security back", async () => {
    await copyMigrations("0044");
    await runMigrations(scratch.ownerUrl, { directory: directory.path });
    for (const id of BEFORE) await organization(id);
    // Nobody can sign in to them and they hold no pairing code: the old sweep skipped them.
    expect(await swept()).toEqual([]);

    await copyMigrations("0045");
    await runMigrations(scratch.ownerUrl, { directory: directory.path });
    expect(await swept()).toEqual(BEFORE);
    await organization(AFTER);
    expect(await swept()).toEqual([...BEFORE, AFTER]);

    const security = await withClient(scratch.ownerUrl, (client: pg.Client) =>
      client.query(
        "SELECT relrowsecurity AS enabled, relforcerowsecurity AS forced FROM pg_class " +
          "WHERE oid = 'organization'::regclass",
      ),
    );
    expect(security.rows).toEqual([{ enabled: true, forced: true }]);
    // Still only the tenant that is open: the owner sees no other organization.
    const seen = await withClient(scratch.ownerUrl, async (client: pg.Client) => {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [AFTER]);
      const rows = (await client.query("SELECT id FROM organization")).rows;
      await client.query("COMMIT");
      return rows;
    });
    expect(seen).toEqual([{ id: AFTER }]);
  });
});
