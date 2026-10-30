import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { runMigrations } from "@fnb/db";
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

async function copyMigrations(before: (name: string) => boolean) {
  const names = (await readdir(MIGRATIONS)).filter((name) => name.endsWith(".sql")).sort();
  const files: Record<string, string> = {};
  for (const name of names.filter(before)) {
    files[name] = await readFile(path.join(MIGRATIONS, name), "utf8");
  }
  await directory.write(files);
}

/** A tenant with one brand and products `names`, inserted as the owner under its own tenant. */
async function tenantWithProducts(tenantId: string, brandId: string, names: string[]) {
  await withClient(scratch.ownerUrl, async (client) => {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    await client.query("INSERT INTO organization (id, tenant_id, name) VALUES ($1, $1, 'Shop')", [
      tenantId,
    ]);
    await client.query("INSERT INTO brand (id, tenant_id, name) VALUES ($1, $2, 'Brand')", [
      brandId,
      tenantId,
    ]);
    for (const [index, name] of names.entries()) {
      await client.query(
        "INSERT INTO product (id, tenant_id, brand_id, kind, name, pricing_mode, created_at) " +
          "VALUES (gen_random_uuid(), $1, $2, 'retail_item', $3, 'fixed', now() + $4 * interval '1 second')",
        [tenantId, brandId, name, index],
      );
    }
    await client.query("COMMIT");
  });
}

const codesOf = (tenantId: string) =>
  withClient(scratch.ownerUrl, async (client) => {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const rows = await client.query<{ name: string; code: string }>(
      "SELECT name, code FROM product ORDER BY created_at, id",
    );
    await client.query("COMMIT");
    return rows.rows.map((row) => [row.name, row.code]);
  });

describe("the migration that adds product codes", () => {
  it("gives every product that already exists a code, numbered per brand, oldest first", async () => {
    await copyMigrations((name) => name < "0038");
    await runMigrations(scratch.ownerUrl, { directory: directory.path });
    const [a, b] = ["0199f000-0000-7000-8000-0000000000a1", "0199f000-0000-7000-8000-0000000000b1"];
    await tenantWithProducts(a!, "0199f000-0000-7000-8000-0000000000a2", ["Cà phê", "Trà", "Bánh"]);
    await tenantWithProducts(b!, "0199f000-0000-7000-8000-0000000000b2", ["Nước"]);

    await copyMigrations((name) => name < "0039");
    const report = await runMigrations(scratch.ownerUrl, { directory: directory.path });
    expect(report.applied).toEqual([expect.stringMatching(/^0038_/)]);

    expect(await codesOf(a!)).toEqual([
      ["Cà phê", "SP00001"],
      ["Trà", "SP00002"],
      ["Bánh", "SP00003"],
    ]);
    expect(await codesOf(b!)).toEqual([["Nước", "SP00001"]]);
  });

  it("leaves row-level security on and forced, and refuses two codes that differ only in case", async () => {
    await copyMigrations(() => true);
    await runMigrations(scratch.ownerUrl, { directory: directory.path });
    const flags = await withClient(scratch.ownerUrl, (client) =>
      client.query<{ on: boolean; forced: boolean }>(
        "SELECT relrowsecurity AS on, relforcerowsecurity AS forced FROM pg_class WHERE relname = 'product'",
      ),
    );
    expect(flags.rows[0]).toEqual({ on: true, forced: true });
    const tenant = "0199f000-0000-7000-8000-0000000000c1";
    await tenantWithProducts(tenant, "0199f000-0000-7000-8000-0000000000c2", []);
    const insert = (code: string) =>
      withClient(scratch.ownerUrl, async (client) => {
        await client.query("BEGIN");
        try {
          await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenant]);
          await client.query(
            "INSERT INTO product (id, tenant_id, brand_id, kind, name, pricing_mode, code) " +
              "SELECT gen_random_uuid(), $1, id, 'retail_item', 'x', 'fixed', $2 FROM brand",
            [tenant, code],
          );
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      });
    await insert("Ab-1");
    await expect(insert("aB-1")).rejects.toMatchObject({ code: "23505" });
    await expect(insert("bad code")).rejects.toMatchObject({ code: "23514" });
  });
});
